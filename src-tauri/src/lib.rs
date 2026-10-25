//! OPEN-RVT: arranque de la aplicación de escritorio.
//!
//! Adaptado del `lib.rs` de PresupuestosPro. Se conservan la capa de preferencias, el
//! plugin de registros, los diálogos nativos, las capacidades y `configurar_webview2`;
//! se quitaron los comandos de presupuesto, el motor, la obra y el asistente.
//!
//! Actualizador: todavía no hay. Cuando exista, se añadirá `tauri-plugin-updater` con su
//! endpoint y su llave pública; no se dejan ni endpoint ni llave en este esqueleto.

mod estado;
mod nucleo;

use estado::{guardar_config, leer_config, Config, EstadoApp, Rutas};
use nucleo::EstadoNucleo;
use tauri::{Emitter, Manager, State};

/// Versión de la aplicación; comando de prueba para validar el puente IPC.
#[tauri::command]
fn version_app() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// O005c: los E2E y el desarrollo arrancan con OPENRVT_SIN_ACTUALIZACIONES=1.
#[tauri::command]
fn actualizaciones_deshabilitadas() -> bool {
    std::env::var("OPENRVT_SIN_ACTUALIZACIONES")
        .map(|v| v == "1")
        .unwrap_or(false)
}

/// O005c: abre en el navegador el enlace de descarga (Linux no instala .deb solo).
#[tauri::command]
fn abrir_enlace(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// O005c: última versión publicada, consultada desde Rust para evitar CORS en Linux.
#[derive(serde::Serialize)]
struct UltimaVersion {
    version: String,
    fecha: Option<String>,
    notas: Option<String>,
}

#[tauri::command]
async fn ultima_version() -> Result<Option<UltimaVersion>, String> {
    const URL: &str =
        "https://gitea.spm.lat/sant4/openrvt-actualizaciones/raw/branch/main/latest.json";
    let cliente = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let respuesta = cliente.get(URL).send().await.map_err(|e| e.to_string())?;
    if respuesta.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !respuesta.status().is_success() {
        return Err(format!("HTTP {}", respuesta.status()));
    }
    let datos: serde_json::Value = respuesta.json().await.map_err(|e| e.to_string())?;
    let Some(version) = datos.get("version").and_then(|v| v.as_str()) else {
        return Ok(None);
    };
    Ok(Some(UltimaVersion {
        version: version.to_string(),
        fecha: datos
            .get("pub_date")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        notas: datos
            .get("notes")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    }))
}

/// Preferencias actuales (ya cargadas al arrancar).
#[tauri::command]
fn obtener_config(estado: State<'_, EstadoApp>) -> Config {
    estado.config().clone()
}

fn guardar(app: &tauri::AppHandle, estado: &EstadoApp) -> Result<(), String> {
    let rutas = Rutas::de(app)?;
    guardar_config(&rutas.config(), &estado.config())
}

/// Migra el tema que la versión anterior guardaba en `localStorage`.
#[tauri::command]
fn migrar_tema_local(
    app: tauri::AppHandle,
    estado: State<'_, EstadoApp>,
    tema: String,
) -> Result<Config, String> {
    {
        let mut config = estado.config();
        config.tema = tema;
    }
    guardar(&app, &estado)?;
    Ok(estado.config().clone())
}

#[tauri::command]
fn guardar_tema(
    app: tauri::AppHandle,
    estado: State<'_, EstadoApp>,
    tema: String,
) -> Result<(), String> {
    estado.config().tema = tema;
    guardar(&app, &estado)
}

#[tauri::command]
fn guardar_idioma(
    app: tauri::AppHandle,
    estado: State<'_, EstadoApp>,
    idioma: String,
) -> Result<(), String> {
    {
        let mut config = estado.config();
        config.idioma = idioma;
        config.idioma_migrado = true;
    }
    guardar(&app, &estado)
}

#[tauri::command]
fn guardar_escala(
    app: tauri::AppHandle,
    estado: State<'_, EstadoApp>,
    escala: u32,
) -> Result<(), String> {
    estado.config().escala_ui = escala;
    guardar(&app, &estado)
}

/// Guarda el color del tema y los personalizados; el payload es el JSON que arma la UI
/// (`{ "color_tema": "...", "personalizados": [...] }`).
#[tauri::command]
fn guardar_color_tema(
    app: tauri::AppHandle,
    estado: State<'_, EstadoApp>,
    payload: String,
) -> Result<(), String> {
    let valor: serde_json::Value =
        serde_json::from_str(&payload).map_err(|e| format!("payload de color no válido: {e}"))?;
    {
        let mut config = estado.config();
        if let Some(color) = valor.get("color_tema").and_then(|v| v.as_str()) {
            config.color_tema = color.to_string();
        }
        if let Some(lista) = valor.get("personalizados").and_then(|v| v.as_array()) {
            config.temas_personalizados = lista
                .iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect();
        }
    }
    guardar(&app, &estado)
}

#[tauri::command]
fn guardar_barra_compacta(
    app: tauri::AppHandle,
    estado: State<'_, EstadoApp>,
    activa: bool,
) -> Result<(), String> {
    estado.config().barra_compacta = activa;
    guardar(&app, &estado)
}

#[tauri::command]
fn guardar_lateral_expandido(
    app: tauri::AppHandle,
    estado: State<'_, EstadoApp>,
    expandido: bool,
) -> Result<(), String> {
    estado.config().lateral_expandido = expandido;
    guardar(&app, &estado)
}

#[tauri::command]
fn guardar_lateral_ancho(
    app: tauri::AppHandle,
    estado: State<'_, EstadoApp>,
    ancho: Option<f64>,
) -> Result<(), String> {
    estado.config().lateral_ancho_rem = ancho;
    guardar(&app, &estado)
}

#[tauri::command]
fn guardar_ancho_columna(
    app: tauri::AppHandle,
    estado: State<'_, EstadoApp>,
    vista: String,
    columna: String,
    ancho: u32,
) -> Result<(), String> {
    {
        let mut config = estado.config();
        config
            .anchos_columnas
            .entry(vista)
            .or_default()
            .insert(columna, ancho);
    }
    guardar(&app, &estado)
}

#[tauri::command]
fn restablecer_anchos(
    app: tauri::AppHandle,
    estado: State<'_, EstadoApp>,
    vista: String,
) -> Result<(), String> {
    estado.config().anchos_columnas.remove(&vista);
    guardar(&app, &estado)
}

#[tauri::command]
fn fijar_titulo_ventana(ventana: tauri::WebviewWindow, titulo: String) -> Result<(), String> {
    ventana.set_title(&titulo).map_err(|e| e.to_string())
}

/// Errores no capturados de la interfaz: quedan en el registro de la aplicación.
#[tauri::command]
fn registrar_error_ui(mensaje: String, detalle: String) {
    log::error!("error de interfaz: {mensaje}\n{detalle}");
}

/// Errores devueltos por un comando: quedan en el registro de la aplicación.
#[tauri::command]
fn registrar_error_comando(comando: String, mensaje: String) {
    log::error!("error en el comando {comando}: {mensaje}");
}

/// Único comando del núcleo IFC: reenvía una llamada JSON-RPC al proceso Python.
#[tauri::command]
fn nucleo_llamar(
    app: tauri::AppHandle,
    estado: State<'_, EstadoNucleo>,
    metodo: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, nucleo::ErrorNucleo> {
    let resultado = estado.0.llamar(&metodo, params);
    for aviso in estado.0.tomar_avisos() {
        let _ = app.emit("nucleo-aviso", aviso);
    }
    resultado
}

pub fn run() {
    log::info!(
        "OPEN-RVT {} arranca en {}",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS
    );

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(EstadoApp::default())
        .manage(EstadoNucleo::default())
        .invoke_handler(tauri::generate_handler![
            version_app,
            actualizaciones_deshabilitadas,
            abrir_enlace,
            ultima_version,
            obtener_config,
            migrar_tema_local,
            guardar_tema,
            guardar_idioma,
            guardar_escala,
            guardar_color_tema,
            guardar_barra_compacta,
            guardar_lateral_expandido,
            guardar_lateral_ancho,
            guardar_ancho_columna,
            restablecer_anchos,
            fijar_titulo_ventana,
            registrar_error_ui,
            registrar_error_comando,
            nucleo_llamar,
        ])
        .setup(|app| {
            // Carpeta real de recursos (en .deb es /usr/lib/<app>/, no /usr/bin).
            if let Ok(recursos) = app.path().resource_dir() {
                app.state::<EstadoNucleo>().0.configurar_recursos(recursos);
            }
            // El proceso Python se lanza al arrancar y queda vivo. Si no hay
            // IfcOpenShell, la app abre igual y el error se muestra en la barra de estado.
            app.state::<EstadoNucleo>().0.precalentar();

            // Preferencias guardadas; si no hayconfig.json se usan las de fábrica.
            let rutas = Rutas::de(app.handle())?;
            let config = leer_config(&rutas.config());
            *app.state::<EstadoApp>().config() = config;

            // Solo en modo debug (pruebas E2E con tauri-driver): si el gestor de ventanas de
            // xvfb ignora la petición de redimensionar, la prueba fija el tamaño inicial aquí
            // con `OPENRVT_TAMANO_VENTANA=ANCHOxALTO`.
            #[cfg(debug_assertions)]
            if let Ok(tam) = std::env::var("OPENRVT_TAMANO_VENTANA") {
                if let Some((ancho, alto)) = tam.trim().split_once(['x', 'X']) {
                    if let (Ok(ancho), Ok(alto)) =
                        (ancho.trim().parse::<f64>(), alto.trim().parse::<f64>())
                    {
                        if let Some(ventana) = tauri::Manager::get_webview_window(app, "main") {
                            let _ = ventana.set_size(tauri::LogicalSize::new(ancho, alto));
                        }
                    }
                }
            }
            #[cfg(windows)]
            configurar_webview2(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error al ejecutar OPEN-RVT")
        .run(|app, evento| {
            if let tauri::RunEvent::Exit = evento {
                app.state::<EstadoNucleo>().0.detener();
            }
        });
}

/// Capa A de la spec 021 (solo Windows / WebView2): la ventana no ofrece menús,
/// atajos, zoom ni barra de estado del navegador. Los atajos propios de la página
/// siguen llegando (WebView2 solo apaga los suyos). En debug se dejan las DevTools.
/// Copiado intacto de PresupuestosPro.
#[cfg(windows)]
fn configurar_webview2(app: &tauri::AppHandle) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows_core::Interface;

    let Some(ventana) = tauri::Manager::get_webview_window(app, "main") else {
        return;
    };
    let _ = ventana.with_webview(|w| unsafe {
        let Ok(nucleo) = w.controller().CoreWebView2() else {
            return;
        };
        let Ok(ajustes) = nucleo.Settings() else {
            return;
        };
        let _ = ajustes.SetAreDefaultContextMenusEnabled(false);
        let _ = ajustes.SetIsZoomControlEnabled(false);
        let _ = ajustes.SetIsStatusBarEnabled(false);
        if let Ok(s3) = ajustes.cast::<ICoreWebView2Settings3>() {
            let _ = s3.SetAreBrowserAcceleratorKeysEnabled(false);
        }
        #[cfg(not(debug_assertions))]
        {
            let _ = ajustes.SetAreDevToolsEnabled(false);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::estado::*;

    #[test]
    fn config_por_omision_y_ida_y_vuelta_json() {
        let c = Config::default();
        assert_eq!(c.tema, "sistema");
        assert_eq!(c.escala_ui, 120);
        assert_eq!(c.idioma, "es");
        assert!(c.anchos_columnas.is_empty());
        let texto = serde_json::to_string(&c).unwrap();
        let vuelta: Config = serde_json::from_str(&texto).unwrap();
        assert_eq!(vuelta.tema, c.tema);
        assert_eq!(vuelta.escala_ui, 120);
    }

    #[test]
    fn leer_config_inexistente_devuelve_omision() {
        let dir = std::env::temp_dir().join("openrvt-config-prueba");
        let ruta = dir.join("no-existe.json");
        let c = leer_config(&ruta);
        assert_eq!(c.tema, "sistema");
    }

    #[test]
    fn guardar_y_leer_config() {
        let dir = std::env::temp_dir().join(format!("openrvt-config-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let ruta = dir.join("config.json");
        let c = Config {
            tema: "oscuro".into(),
            escala_ui: 130,
            ..Config::default()
        };
        guardar_config(&ruta, &c).unwrap();
        let leido = leer_config(&ruta);
        assert_eq!(leido.tema, "oscuro");
        assert_eq!(leido.escala_ui, 130);
        std::fs::remove_dir_all(&dir).ok();
    }
}
