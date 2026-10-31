//! O018: escucha nativa de los gestos que Windows entrega a la ventana.
//!
//! Subclasifica el HWND principal y las ventanas hijas de WebView2 con
//! `SetWindowSubclass`. No consume nada: siempre termina en `DefSubclassProc`.
//! Cada mensaje interesante se reenvía al frontend como `gesto-nativo`, para que
//! la grabación del diagnóstico y el visor decidan qué hacer con él.

use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::Emitter;

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::Pointer::{GetPointerInfo, GetPointerType, POINTER_INFO};
use windows::Win32::UI::Input::Touch::{
    GetGestureInfo, RegisterTouchWindow, SetGestureConfig, GESTURECONFIG, GESTUREINFO,
    GID_PAN, GID_ZOOM, HGESTUREINFO, REGISTER_TOUCH_WINDOW_FLAGS,
};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, DM_POINTERHITTEST, PT_TOUCH, PT_TOUCHPAD, WM_GESTURE,
    WM_MOUSEHWHEEL, WM_MOUSEWHEEL, WM_POINTERDOWN, WM_POINTERUP, WM_POINTERUPDATE, WM_TOUCH,
};

/// Identificador de la subclase; uno distinto por HWND no hace falta porque cada
/// ventana tiene su propia lista de subclases.
const ID_SUBCLASE: usize = 0x0018;

/// Máximo de eventos reenviados por segundo (spec O018, parte 1).
const MAX_EVENTOS_POR_SEGUNDO: u32 = 200;

static PRINCIPAL: AtomicIsize = AtomicIsize::new(0);
static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static INICIO: OnceLock<Instant> = OnceLock::new();

struct Limite {
    ventana: Option<Instant>,
    cuenta: u32,
}

static LIMITE: Mutex<Limite> = Mutex::new(Limite {
    ventana: None,
    cuenta: 0,
});

/// Instala la escucha en la ventana principal y en sus hijas. Solo Windows.
pub fn instalar(app: &tauri::AppHandle) {
    use tauri::Manager;

    let Some(ventana) = app.get_webview_window("main") else {
        return;
    };
    let Ok(hwnd) = ventana.hwnd() else {
        return;
    };
    let _ = APP.set(app.clone());
    let _ = INICIO.set(Instant::now());
    PRINCIPAL.store(hwnd.0 as isize, Ordering::SeqCst);

    unsafe {
        // Pedimos a Windows que entregue WM_GESTURE de zoom en esta ventana.
        let _ = RegisterTouchWindow(hwnd, REGISTER_TOUCH_WINDOW_FLAGS(0));
        let configuracion = [GESTURECONFIG {
            dwID: GID_ZOOM,
            dwWant: 1,
            dwBlock: 0,
        }];
        let _ = SetGestureConfig(
            hwnd,
            0,
            &configuracion,
            std::mem::size_of::<GESTURECONFIG>() as u32,
        );
        instalar_en_ventana(hwnd);
        enumerar_hijas(hwnd);
    }

    // WebView2 crea sus ventanas hijas tarde: se vuelve a enumerar a los 2 s.
    let app_tardia = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(2));
        let app_hilo = app_tardia.clone();
        let _ = app_tardia.run_on_main_thread(move || {
            use tauri::Manager;
            let Some(ventana) = app_hilo.get_webview_window("main") else {
                return;
            };
            let Ok(hwnd) = ventana.hwnd() else {
                return;
            };
            unsafe { enumerar_hijas(hwnd) };
        });
    });
}

unsafe fn instalar_en_ventana(hwnd: HWND) {
    let _ = SetWindowSubclass(hwnd, Some(subclase), ID_SUBCLASE, 0);
}

unsafe fn enumerar_hijas(principal: HWND) {
    let _ = EnumChildWindows(Some(principal), Some(subclase_hija), LPARAM(0));
}

unsafe extern "system" fn subclase_hija(hwnd: HWND, _lparam: LPARAM) -> windows_core::BOOL {
    instalar_en_ventana(hwnd);
    true.into()
}

fn es_principal(hwnd: HWND) -> bool {
    hwnd.0 as isize == PRINCIPAL.load(Ordering::SeqCst)
}

fn nombre_ventana(hwnd: HWND) -> &'static str {
    if es_principal(hwnd) {
        "principal"
    } else {
        "webview-hija"
    }
}

/// Reenvía el mensaje respetando el límite de 200 eventos por segundo.
fn enviar(hwnd: HWND, mensaje: &str, detalle: serde_json::Value) {
    let Some(app) = APP.get() else {
        return;
    };
    let ahora = Instant::now();
    {
        let Ok(mut limite) = LIMITE.lock() else {
            return;
        };
        match limite.ventana {
            Some(inicio) if ahora.duration_since(inicio) < Duration::from_secs(1) => {
                if limite.cuenta >= MAX_EVENTOS_POR_SEGUNDO {
                    return;
                }
                limite.cuenta += 1;
            }
            _ => {
                limite.ventana = Some(ahora);
                limite.cuenta = 1;
            }
        }
    }
    let ms = INICIO
        .get()
        .map(|inicio| ahora.duration_since(*inicio).as_millis() as u64)
        .unwrap_or(0);
    let _ = app.emit(
        "gesto-nativo",
        serde_json::json!({
            "ms": ms,
            "ventana": nombre_ventana(hwnd),
            "mensaje": mensaje,
            "detalle": detalle,
        }),
    );
}

unsafe extern "system" fn subclase(
    hwnd: HWND,
    mensaje: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _datos: usize,
) -> LRESULT {
    match mensaje {
        WM_GESTURE => {
            let mut info = GESTUREINFO {
                cbSize: std::mem::size_of::<GESTUREINFO>() as u32,
                ..Default::default()
            };
            if GetGestureInfo(HGESTUREINFO(lparam.0 as *mut _), &mut info).is_ok() {
                let id = info.dwID;
                let nombre = if id == GID_ZOOM.0 {
                    "GID_ZOOM"
                } else if id == GID_PAN.0 {
                    "GID_PAN"
                } else {
                    "GID_OTRO"
                };
                enviar(
                    hwnd,
                    nombre,
                    serde_json::json!({
                        "id": id,
                        "flags": info.dwFlags,
                        "ullArguments": info.ullArguments,
                        "x": info.ptsLocation.x,
                        "y": info.ptsLocation.y,
                    }),
                );
            }
        }
        WM_POINTERDOWN | WM_POINTERUPDATE | WM_POINTERUP => {
            let pointer_id = (wparam.0 & 0xFFFF) as u32;
            let mut tipo = Default::default();
            let mut info = POINTER_INFO::default();
            let tipo_ok = GetPointerType(pointer_id, &mut tipo).is_ok();
            let info_ok = GetPointerInfo(pointer_id, &mut info).is_ok();
            let nombre = if mensaje == WM_POINTERDOWN {
                "WM_POINTERDOWN"
            } else if mensaje == WM_POINTERUPDATE {
                "WM_POINTERUPDATE"
            } else {
                "WM_POINTERUP"
            };
            let tipo_texto = if !tipo_ok {
                "desconocido"
            } else if tipo == PT_TOUCHPAD {
                "touchpad"
            } else if tipo == PT_TOUCH {
                "touch"
            } else {
                "otro"
            };
            enviar(
                hwnd,
                nombre,
                serde_json::json!({
                    "pointerId": pointer_id,
                    "tipo": tipo_texto,
                    "x": if info_ok { info.ptPixelLocation.x } else { 0 },
                    "y": if info_ok { info.ptPixelLocation.y } else { 0 },
                }),
            );
        }
        DM_POINTERHITTEST => {
            enviar(
                hwnd,
                "DM_POINTERHITTEST",
                serde_json::json!({ "pointerId": (wparam.0 & 0xFFFF) as u32 }),
            );
        }
        WM_MOUSEWHEEL | WM_MOUSEHWHEEL => {
            let delta = ((wparam.0 >> 16) & 0xFFFF) as u16 as i16;
            let teclas = (wparam.0 & 0xFFFF) as u32;
            // MK_CONTROL = 0x0008; se evita pedir otra feature solo por la constante.
            let control = teclas & 0x0008 != 0;
            let nombre = if mensaje == WM_MOUSEWHEEL {
                "WM_MOUSEWHEEL"
            } else {
                "WM_MOUSEHWHEEL"
            };
            enviar(
                hwnd,
                nombre,
                serde_json::json!({ "delta": delta, "control": control }),
            );
        }
        WM_TOUCH => {
            enviar(
                hwnd,
                "WM_TOUCH",
                serde_json::json!({ "contactos": (wparam.0 & 0xFFFF) as u32 }),
            );
        }
        _ => {}
    }
    DefSubclassProc(hwnd, mensaje, wparam, lparam)
}
