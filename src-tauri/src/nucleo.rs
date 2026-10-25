//! Puente con el núcleo IFC de Python (JSON-RPC 2.0 por stdin/stdout).
//!
//! El proceso se lanza al arrancar la aplicación y se mantiene vivo. Si muere, se
//! relanza en la siguiente llamada; la interfaz recibe el aviso por el evento
//! `nucleo-aviso`. Cada llamada tiene un id propio y un tiempo máximo de espera.

use serde_json::{json, Value};
use std::collections::VecDeque;
use std::ffi::OsString;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

/// Tiempo máximo de una llamada (60 s, como pide la especificación).
pub const TIMEOUT: Duration = Duration::from_secs(60);
const MAX_LINEAS_ERROR: usize = 6;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ErrorNucleo {
    pub mensaje: String,
    /// Código JSON-RPC cuando el error viene del núcleo.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codigo: Option<i64>,
    /// Traza de Python (`traceback.format_exc()`), si el núcleo la envió.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub traza: Option<String>,
}

impl ErrorNucleo {
    fn nuevo(mensaje: impl Into<String>) -> Self {
        Self {
            mensaje: mensaje.into(),
            codigo: None,
            traza: None,
        }
    }

    fn del_nucleo(mensaje: impl Into<String>, codigo: Option<i64>, traza: Option<String>) -> Self {
        Self {
            mensaje: mensaje.into(),
            codigo,
            traza,
        }
    }
}

impl std::fmt::Display for ErrorNucleo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.codigo {
            Some(codigo) => write!(f, "{} (código {codigo})", self.mensaje),
            None => f.write_str(&self.mensaje),
        }
    }
}

impl std::error::Error for ErrorNucleo {}

struct Proceso {
    hijo: Child,
    entrada: ChildStdin,
    salida: Option<BufReader<ChildStdout>>,
    errores: Arc<Mutex<VecDeque<String>>>,
}

impl Drop for Proceso {
    fn drop(&mut self) {
        let _ = self.hijo.kill();
        let _ = self.hijo.wait();
    }
}

impl Proceso {
    fn vivo(&mut self) -> bool {
        matches!(self.hijo.try_wait(), Ok(None))
    }

    fn ultimos_errores(&self) -> String {
        let guard = self
            .errores
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        guard.iter().cloned().collect::<Vec<_>>().join(" | ")
    }
}

/// Núcleo IFC del proceso Rust.
pub struct Nucleo {
    programa: OsString,
    argumentos: Vec<OsString>,
    /// Carpeta que se añade a `PYTHONPATH` (la que contiene `openrvt_nucleo/`).
    pythonpath: Option<PathBuf>,
    /// Carpeta de recursos de la app (`app.path().resource_dir()`).
    recursos: Mutex<Option<PathBuf>>,
    timeout: Duration,
    proceso: Mutex<Option<Proceso>>,
    siguiente_id: AtomicI64,
    generacion: AtomicU64,
    avisos: Mutex<Vec<String>>,
}

impl Default for Nucleo {
    fn default() -> Self {
        Self::nuevo()
    }
}

impl Nucleo {
    /// Núcleo de producción. El intérprete se resuelve en este orden:
    /// `OPENRVT_PYTHON`, `recursos/python/` junto al ejecutable y `python3`/`python`.
    pub fn nuevo() -> Self {
        let programa = resolver_interprete();
        let pythonpath = buscar_carpeta_nucleo();
        let mut argumentos = vec![OsString::from("-u"), OsString::from("-m")];
        argumentos.push(OsString::from("openrvt_nucleo.servidor"));
        Self {
            programa,
            argumentos,
            pythonpath,
            recursos: Mutex::new(None),
            timeout: TIMEOUT,
            proceso: Mutex::new(None),
            siguiente_id: AtomicI64::new(1),
            generacion: AtomicU64::new(0),
            avisos: Mutex::new(Vec::new()),
        }
    }

    /// Núcleo con un programa concreto; se usa en las pruebas con un script de eco.
    #[cfg(test)]
    pub fn de_prueba(programa: impl Into<OsString>, argumentos: Vec<OsString>, timeout: Duration) -> Self {
        Self {
            programa: programa.into(),
            argumentos,
            pythonpath: None,
            recursos: Mutex::new(None),
            timeout,
            proceso: Mutex::new(None),
            siguiente_id: AtomicI64::new(1),
            generacion: AtomicU64::new(0),
            avisos: Mutex::new(Vec::new()),
        }
    }

    /// Fija la carpeta de recursos de Tauri. En el .deb los recursos no quedan junto al
    /// ejecutable (/usr/bin) sino en `/usr/lib/<app>/`; `resource_dir()` da la ruta real.
    /// `OPENRVT_PYTHON` sigue teniendo prioridad (pruebas y desarrollo).
    pub fn configurar_recursos(&self, recursos: PathBuf) {
        let mut guard = self.recursos.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(recursos);
    }

    /// Carpeta de recursos configurada (para diagnóstico y pruebas).
    #[cfg(test)]
    #[allow(dead_code)]
    pub fn recursos(&self) -> Option<PathBuf> {
        self.recursos
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Programa y PYTHONPATH efectivos: los recursos de Tauri mandan sobre el
    /// intérprete del sistema, salvo que `OPENRVT_PYTHON` esté definido.
    fn programa_efectivo(&self) -> (OsString, Option<PathBuf>) {
        let con_env = std::env::var_os("OPENRVT_PYTHON").is_some_and(|ruta| !ruta.is_empty());
        if !con_env {
            let recursos = self
                .recursos
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone();
            if let Some(recursos) = recursos {
                if let Some(ruta) = interprete_en_recursos(&recursos) {
                    let carpeta = buscar_carpeta_nucleo_en(&recursos)
                        .or_else(|| self.pythonpath.clone());
                    return (ruta.into_os_string(), carpeta);
                }
            }
        }
        (self.programa.clone(), self.pythonpath.clone())
    }

    /// Lanza el proceso si todavía no está vivo. Si falla, la app sigue abierta y el
    /// error se devuelve en la primera llamada.
    pub fn precalentar(&self) {
        let mut guard = self.proceso.lock().unwrap_or_else(|e| e.into_inner());
        if guard.as_mut().is_some_and(Proceso::vivo) {
            return;
        }
        match self.lanzar() {
            Ok(proceso) => *guard = Some(proceso),
            Err(error) => self.anotar_aviso(error),
        }
    }

    /// Avisos pendientes (proceso relanzado, error de arranque) para la barra de estado.
    pub fn tomar_avisos(&self) -> Vec<String> {
        let mut guard = self.avisos.lock().unwrap_or_else(|e| e.into_inner());
        std::mem::take(&mut *guard)
    }

    /// Cierra el proceso (al salir de la aplicación).
    pub fn detener(&self) {
        let mut guard = self.proceso.lock().unwrap_or_else(|e| e.into_inner());
        *guard = None;
    }

    fn anotar_aviso(&self, aviso: impl Into<String>) {
        self.avisos
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(aviso.into());
    }

    fn lanzar(&self) -> Result<Proceso, String> {
        let (programa, pythonpath) = self.programa_efectivo();
        let mut comando = Command::new(&programa);
        comando
            .args(&self.argumentos)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("PYTHONUNBUFFERED", "1")
            // En Windows Python usa cp1252 en las tuberías; el puente lee UTF-8.
            .env("PYTHONUTF8", "1")
            .env("PYTHONIOENCODING", "utf-8");
        if let Some(carpeta) = &pythonpath {
            let actual = std::env::var_os("PYTHONPATH").unwrap_or_default();
            let mut valor = carpeta.clone().into_os_string();
            if !actual.is_empty() {
                valor.push(if cfg!(windows) { ";" } else { ":" });
                valor.push(actual);
            }
            comando.env("PYTHONPATH", valor);
        }
        // En Windows el intérprete embebido es python.exe (necesita stdin/stdout para
        // JSON-RPC); CREATE_NO_WINDOW evita que se abra una consola.
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            comando.creation_flags(CREATE_NO_WINDOW);
        }
        let mut hijo = comando.spawn().map_err(|e| {
            format!(
                "no se pudo lanzar el intérprete «{}»: {e}",
                programa.to_string_lossy()
            )
        })?;
        let entrada = hijo
            .stdin
            .take()
            .ok_or_else(|| "el proceso no tiene stdin".to_string())?;
        let salida = hijo
            .stdout
            .take()
            .ok_or_else(|| "el proceso no tiene stdout".to_string())?;
        let errores = Arc::new(Mutex::new(VecDeque::new()));
        if let Some(stderr) = hijo.stderr.take() {
            let errores_hilo = Arc::clone(&errores);
            std::thread::spawn(move || {
                let lector = BufReader::new(stderr);
                for linea in lector.lines().map_while(Result::ok) {
                    log::info!("núcleo IFC: {linea}");
                    let mut guard = errores_hilo.lock().unwrap_or_else(|e| e.into_inner());
                    guard.push_back(linea);
                    while guard.len() > MAX_LINEAS_ERROR {
                        guard.pop_front();
                    }
                }
            });
        }
        let generacion = self.generacion.fetch_add(1, Ordering::SeqCst) + 1;
        if generacion > 1 {
            self.anotar_aviso("Núcleo IFC reiniciado.");
        }
        Ok(Proceso {
            hijo,
            entrada,
            salida: Some(BufReader::new(salida)),
            errores,
        })
    }

    /// Envía una llamada JSON-RPC y devuelve el campo `result`.
    pub fn llamar(&self, metodo: &str, params: Value) -> Result<Value, ErrorNucleo> {
        self.llamar_interno(metodo, params, true)
    }

    fn llamar_interno(
        &self,
        metodo: &str,
        params: Value,
        reintentar: bool,
    ) -> Result<Value, ErrorNucleo> {
        let mut guard = self.proceso.lock().unwrap_or_else(|e| e.into_inner());
        if guard.as_mut().is_some_and(|p| !p.vivo()) {
            *guard = None;
        }
        if guard.is_none() {
            match self.lanzar() {
                Ok(proceso) => *guard = Some(proceso),
                Err(error) => return Err(ErrorNucleo::nuevo(error)),
            }
        }
        let proceso = guard.as_mut().expect("el proceso se lanzó arriba");
        let id = self.siguiente_id.fetch_add(1, Ordering::SeqCst);
        let solicitud = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": metodo,
            "params": params.clone(),
        });
        let mut texto = serde_json::to_string(&solicitud)
            .map_err(|e| ErrorNucleo::nuevo(format!("no se pudo serializar la llamada: {e}")))?;
        texto.push('\n');
        if let Err(error) = proceso
            .entrada
            .write_all(texto.as_bytes())
            .and_then(|_| proceso.entrada.flush())
        {
            let detalle = proceso.ultimos_errores();
            *guard = None;
            if reintentar {
                drop(guard);
                return self.llamar_interno(metodo, params, false);
            }
            return Err(ErrorNucleo::nuevo(format!(
                "el núcleo IFC no acepta la llamada: {error}{}",
                detalle_si_hay(&detalle)
            )));
        }

        let salida = proceso
            .salida
            .take()
            .ok_or_else(|| ErrorNucleo::nuevo("el núcleo IFC no tiene stdout"))?;
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut lector = salida;
            let mut linea = String::new();
            let resultado = lector.read_line(&mut linea);
            let _ = tx.send((lector, resultado, linea));
        });
        let recibido = match rx.recv_timeout(self.timeout) {
            Ok(valor) => valor,
            Err(_) => {
                let _ = proceso.hijo.kill();
                *guard = None;
                return Err(ErrorNucleo::nuevo(format!(
                    "el núcleo IFC no respondió en {} s.",
                    self.timeout.as_secs()
                )));
            }
        };
        let (lector, resultado, linea) = recibido;
        proceso.salida = Some(lector);
        let leidos = resultado.map_err(|e| {
            ErrorNucleo::nuevo(format!("error al leer del núcleo IFC: {e}"))
        })?;
        if leidos == 0 {
            let detalle = proceso.ultimos_errores();
            *guard = None;
            if reintentar {
                drop(guard);
                return self.llamar_interno(metodo, params, false);
            }
            return Err(ErrorNucleo::nuevo(format!(
                "el núcleo IFC terminó inesperadamente.{}",
                detalle_si_hay(&detalle)
            )));
        }

        let respuesta: Value = serde_json::from_str(linea.trim()).map_err(|e| {
            ErrorNucleo::nuevo(format!("respuesta no válida del núcleo IFC: {e}"))
        })?;
        if respuesta.get("id").and_then(Value::as_i64) != Some(id) {
            return Err(ErrorNucleo::nuevo(
                "la respuesta del núcleo IFC no corresponde a la llamada.",
            ));
        }
        if let Some(error) = respuesta.get("error") {
            let mensaje = error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("error desconocido del núcleo IFC");
            let codigo = error.get("code").and_then(Value::as_i64);
            // O006c: se conserva la traza de Python hasta la interfaz.
            let traza = error
                .get("data")
                .and_then(|datos| datos.get("traza"))
                .or_else(|| error.get("traza"))
                .and_then(Value::as_str)
                .map(str::to_string);
            return Err(ErrorNucleo::del_nucleo(mensaje, codigo, traza));
        }
        Ok(respuesta.get("result").cloned().unwrap_or(Value::Null))
    }
}

fn detalle_si_hay(detalle: &str) -> String {
    if detalle.trim().is_empty() {
        String::new()
    } else {
        format!(" Detalle: {detalle}")
    }
}

/// Ejecutable de Python: `OPENRVT_PYTHON`, recursos de la app, `recursos/python/`
/// junto al ejecutable, o `python3`/`python`.
pub fn resolver_interprete() -> OsString {
    resolver_interprete_en(None)
}

/// Igual que [`resolver_interprete`] pero teniendo en cuenta la carpeta de recursos
/// que Tauri resuelve en tiempo de ejecución (en .deb puede no estar junto al binario).
pub fn resolver_interprete_en(recursos: Option<&Path>) -> OsString {
    if let Some(ruta) = std::env::var_os("OPENRVT_PYTHON") {
        if !ruta.is_empty() {
            return ruta;
        }
    }
    if let Some(ruta) = recursos.and_then(interprete_en_recursos) {
        return ruta.into_os_string();
    }
    if let Some(ruta) = interprete_empaquetado() {
        return ruta.into_os_string();
    }
    if cfg!(windows) {
        OsString::from("python")
    } else {
        OsString::from("python3")
    }
}

/// Python embebido junto al ejecutable: `<ejecutable>/recursos/python/`.
pub fn interprete_empaquetado() -> Option<PathBuf> {
    let ejecutable = std::env::current_exe().ok()?;
    let base = ejecutable.parent()?.join("recursos").join("python");
    interprete_en(&base)
}

/// Python embebido dentro de la carpeta de recursos de Tauri:
/// `<recursos>/recursos/python/`. En el .deb `<recursos>` es `/usr/lib/<app>/`.
pub fn interprete_en_recursos(recursos: &Path) -> Option<PathBuf> {
    interprete_en(&recursos.join("recursos").join("python"))
}

fn interprete_en(base: &Path) -> Option<PathBuf> {
    if base.is_file() {
        return Some(base.to_path_buf());
    }
    if !base.is_dir() {
        return None;
    }
    let candidatos = if cfg!(windows) {
        vec!["python.exe", "python3.exe", "python"]
    } else {
        vec!["bin/python3.12", "bin/python3", "bin/python", "python3", "python"]
    };
    candidatos
        .into_iter()
        .map(|relativo| base.join(relativo))
        .find(|ruta| ruta.is_file())
}

/// Carpeta que contiene el paquete `openrvt_nucleo/` (para `PYTHONPATH`).
pub fn buscar_carpeta_nucleo() -> Option<PathBuf> {
    buscar_carpeta_nucleo_en(Path::new(""))
}

/// Como [`buscar_carpeta_nucleo`] pero mira primero en la carpeta de recursos.
pub fn buscar_carpeta_nucleo_en(recursos: &Path) -> Option<PathBuf> {
    if let Some(ruta) = std::env::var_os("OPENRVT_NUCLEO_DIR") {
        let ruta = PathBuf::from(ruta);
        if ruta.join("openrvt_nucleo").is_dir() {
            return Some(ruta);
        }
    }
    if let Some(carpeta) = empaquetado_en(recursos) {
        return Some(carpeta);
    }
    let mut bases: Vec<PathBuf> = Vec::new();
    if let Ok(actual) = std::env::current_dir() {
        bases.push(actual);
    }
    if let Ok(ejecutable) = std::env::current_exe() {
        bases.extend(ejecutable.ancestors().map(Path::to_path_buf));
    }
    for base in bases {
        for candidato in [base.join("nucleo"), base.join("../nucleo"), base.join("../../nucleo")] {
            let candidato = candidato
                .canonicalize()
                .unwrap_or_else(|_| candidato.clone());
            if candidato.join("openrvt_nucleo").is_dir() {
                return Some(candidato);
            }
        }
    }
    None
}

/// `<recursos>/recursos/python/nucleo` cuando existe.
fn empaquetado_en(recursos: &Path) -> Option<PathBuf> {
    if recursos.as_os_str().is_empty() {
        return None;
    }
    let carpeta = recursos.join("recursos").join("python").join("nucleo");
    if carpeta.join("openrvt_nucleo").is_dir() {
        return Some(carpeta);
    }
    None
}

/// Estado que Tauri comparte entre comandos.
#[derive(Default)]
pub struct EstadoNucleo(pub Nucleo);

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn script(nombre: &str, contenido: &str) -> PathBuf {
        let carpeta = std::env::temp_dir().join(format!("openrvt-nucleo-{}", std::process::id()));
        std::fs::create_dir_all(&carpeta).unwrap();
        let ruta = carpeta.join(nombre);
        std::fs::write(&ruta, contenido).unwrap();
        ruta
    }

    #[test]
    fn una_llamada_vuelve_con_su_id() {
        let ruta = script(
            "eco.py",
            r#"
import json, sys
for linea in sys.stdin:
    peticion = json.loads(linea)
    respuesta = {"jsonrpc": "2.0", "id": peticion["id"], "result": {
        "id": peticion["id"], "metodo": peticion["method"], "params": peticion.get("params")}}
    print(json.dumps(respuesta), flush=True)
"#,
        );
        let nucleo = Nucleo::de_prueba(
            "python3",
            vec![ruta.into_os_string()],
            Duration::from_secs(5),
        );
        let primera = nucleo.llamar("hola.mundo", json!({"n": 1})).unwrap();
        let segunda = nucleo.llamar("otra", json!({"n": 2})).unwrap();
        assert_eq!(primera["metodo"], "hola.mundo");
        assert_eq!(primera["params"]["n"], 1);
        assert_eq!(segunda["params"]["n"], 2);
        assert_eq!(
            segunda["id"].as_i64().unwrap(),
            primera["id"].as_i64().unwrap() + 1
        );
    }

    #[test]
    fn si_el_proceso_muere_se_relanza() {
        // Responde una vez y termina: la segunda llamada debe relanzarlo.
        let ruta = script(
            "muere.py",
            r#"
import json, os, sys
linea = sys.stdin.readline()
peticion = json.loads(linea)
print(json.dumps({"jsonrpc": "2.0", "id": peticion["id"], "result": {"vivo": True}}), flush=True)
os._exit(0)
"#,
        );
        let nucleo = Nucleo::de_prueba(
            "python3",
            vec![ruta.into_os_string()],
            Duration::from_secs(5),
        );
        assert_eq!(nucleo.llamar("uno", json!({})).unwrap()["vivo"], true);
        assert_eq!(nucleo.llamar("dos", json!({})).unwrap()["vivo"], true);
        let avisos = nucleo.tomar_avisos();
        assert!(avisos.iter().any(|a| a.contains("reiniciado")));
    }

    #[test]
    fn un_timeout_devuelve_error() {
        let ruta = script(
            "lento.py",
            r#"
import json, sys, time
for linea in sys.stdin:
    time.sleep(5)
    print("{}", flush=True)
"#,
        );
        let nucleo = Nucleo::de_prueba(
            "python3",
            vec![ruta.into_os_string()],
            Duration::from_millis(300),
        );
        let inicio = Instant::now();
        let error = nucleo.llamar("lento", json!({})).unwrap_err();
        assert!(error.to_string().contains("no respondió"));
        assert!(inicio.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn un_error_jsonrpc_llega_como_error_con_mensaje() {
        let ruta = script(
            "error.py",
            r#"
import json, sys
for linea in sys.stdin:
    peticion = json.loads(linea)
    print(json.dumps({"jsonrpc": "2.0", "id": peticion["id"], "error": {
        "code": -32601, "message": "Método desconocido"}}), flush=True)
"#,
        );
        let nucleo = Nucleo::de_prueba(
            "python3",
            vec![ruta.into_os_string()],
            Duration::from_secs(5),
        );
        let error = nucleo.llamar("no.existe", json!({})).unwrap_err();
        assert!(error.to_string().contains("Método desconocido"));
        assert!(error.to_string().contains("-32601"));
    }

    #[test]
    fn un_error_jsonrpc_conserva_codigo_y_traza() {
        let ruta = script(
            "error-traza.py",
            r#"
import json, sys
for linea in sys.stdin:
    peticion = json.loads(linea)
    print(json.dumps({"jsonrpc": "2.0", "id": peticion["id"], "error": {
        "code": -32027, "message": "Los ejes deben ser paralelos.",
        "data": {"traza": "Traceback (most recent call last):\nValueError: no paralelos"}}}), flush=True)
"#,
        );
        let nucleo = Nucleo::de_prueba(
            "python3",
            vec![ruta.into_os_string()],
            Duration::from_secs(5),
        );
        let error = nucleo.llamar("ejes.separacion", json!({})).unwrap_err();
        assert_eq!(error.mensaje, "Los ejes deben ser paralelos.");
        assert_eq!(error.codigo, Some(-32027));
        let traza = error.traza.as_deref().unwrap();
        assert!(traza.contains("Traceback (most recent call last)"));
        assert!(traza.contains("ValueError: no paralelos"));
        let json = serde_json::to_value(&error).unwrap();
        assert_eq!(json["mensaje"], "Los ejes deben ser paralelos.");
        assert_eq!(json["codigo"], -32027);
        assert!(json["traza"].as_str().unwrap().contains("ValueError"));
    }

    #[test]
    fn el_python_empaquetado_se_encuentra_en_la_carpeta_de_recursos() {
        let base = std::env::temp_dir().join(format!(
            "openrvt-recursos-{}-{}",
            std::process::id(),
            "interprete"
        ));
        let python = if cfg!(windows) {
            base.join("recursos").join("python").join("python.exe")
        } else {
            base.join("recursos").join("python").join("bin").join("python3.12")
        };
        std::fs::create_dir_all(python.parent().unwrap()).unwrap();
        std::fs::write(&python, b"").unwrap();

        // El .deb deja los recursos en /usr/lib/<app>/; la ruta debe salir de ahí y
        // no de la carpeta del ejecutable.
        assert_eq!(interprete_en_recursos(&base), Some(python));
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn la_carpeta_del_nucleo_empaquetado_se_usa_para_pythonpath() {
        let base = std::env::temp_dir().join(format!(
            "openrvt-recursos-{}-{}",
            std::process::id(),
            "nucleo"
        ));
        let paquete = base
            .join("recursos")
            .join("python")
            .join("nucleo")
            .join("openrvt_nucleo");
        std::fs::create_dir_all(&paquete).unwrap();
        assert_eq!(
            buscar_carpeta_nucleo_en(&base),
            Some(base.join("recursos").join("python").join("nucleo"))
        );
        std::fs::remove_dir_all(&base).ok();
    }
}
