//! O006c: bitácora de sesión, en JSON Lines y exportable.
//!
//! La interfaz manda lotes de eventos; aquí se les pone `ts` y `sesion` y se añaden al
//! archivo de la sesión (`<carpeta de logs>/bitacora/<fecha>_<hora>_<sesion>.jsonl`).
//! También se guardan las líneas de stderr del núcleo Python y se exporta un .zip con
//! las sesiones, `OPEN-RVT.log`, `sistema.json` y, si se pide, el IFC abierto.

use serde::Serialize;
use serde_json::{json, Value};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use zip::write::SimpleFileOptions;

/// Se conservan las últimas 20 sesiones…
pub const MAX_SESIONES: usize = 20;
/// …sin que el conjunto pase de 50 MB.
pub const MAX_BYTES: u64 = 50 * 1024 * 1024;

const NOMBRE_LOG: &str = "OPEN-RVT.log";

#[derive(Debug, Clone, Serialize)]
pub struct DatosSesion {
    pub sesion: String,
    pub ruta: Option<String>,
    pub carpeta: Option<String>,
}

pub struct Bitacora {
    sesion: String,
    dir: Mutex<Option<PathBuf>>,
    /// Evento `inicio` de la sesión, para `sistema.json` del .zip.
    sistema: Mutex<Option<Value>>,
}

/// Estado que Tauri comparte entre comandos.
#[derive(Default)]
pub struct EstadoBitacora(pub std::sync::Arc<Bitacora>);

impl Default for Bitacora {
    fn default() -> Self {
        Self::nuevo()
    }
}

impl Bitacora {
    pub fn nuevo() -> Self {
        let ahora = chrono::Local::now();
        let sesion = format!(
            "{}_{}",
            ahora.format("%Y%m%d_%H%M%S"),
            std::process::id()
        );
        Self {
            sesion,
            dir: Mutex::new(None),
            sistema: Mutex::new(None),
        }
    }

    /// Solo pruebas: sesión y carpeta fijas.
    #[cfg(test)]
    fn de_prueba(dir: PathBuf, sesion: impl Into<String>) -> Self {
        Self {
            sesion: sesion.into(),
            dir: Mutex::new(Some(dir)),
            sistema: Mutex::new(None),
        }
    }

    pub fn dir(&self) -> Option<PathBuf> {
        self.dir.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Fija la carpeta de logs y crea `bitacora/`. Rota las sesiones anteriores.
    pub fn iniciar(&self, app: &AppHandle) {
        let carpeta = carpeta_de_logs(app);
        let dir = carpeta.join("bitacora");
        if let Err(error) = fs::create_dir_all(&dir) {
            log::error!("bitácora: no se pudo crear {}: {error}", dir.display());
            return;
        }
        *self.dir.lock().unwrap_or_else(|e| e.into_inner()) = Some(dir.clone());
        if let Err(error) = rotar(&dir) {
            log::error!("bitácora: fallo al rotar: {error}");
        }
    }

    pub fn datos_sesion(&self) -> DatosSesion {
        let dir = self.dir();
        DatosSesion {
            sesion: self.sesion.clone(),
            ruta: dir.as_ref().map(|d| self.archivo_en(d).display().to_string()),
            carpeta: dir.map(|d| d.display().to_string()),
        }
    }

    fn archivo_en(&self, dir: &Path) -> PathBuf {
        dir.join(format!("{}.jsonl", self.sesion))
    }

    /// Añade un lote de eventos al archivo de la sesión (una línea JSON por evento).
    pub fn agregar(&self, eventos: &[Value]) -> Result<(), String> {
        if eventos.is_empty() {
            return Ok(());
        }
        let dir = self
            .dir()
            .ok_or_else(|| "la bitácora todavía no tiene carpeta".to_string())?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let ruta = self.archivo_en(&dir);
        let mut archivo = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&ruta)
            .map_err(|e| format!("no se pudo abrir {}: {e}", ruta.display()))?;
        let mut texto = String::new();
        for evento in eventos {
            let mut linea = evento.clone();
            if let Some(obj) = linea.as_object_mut() {
                if !obj.contains_key("ts") {
                    obj.insert("ts".into(), json!(ahora_iso()));
                }
                obj.insert("sesion".into(), json!(self.sesion));
                if obj.get("tipo").and_then(Value::as_str) == Some("inicio") {
                    *self.sistema.lock().unwrap_or_else(|e| e.into_inner()) = Some(linea.clone());
                }
            }
            texto.push_str(&serde_json::to_string(&linea).map_err(|e| e.to_string())?);
            texto.push('\n');
        }
        archivo
            .write_all(texto.as_bytes())
            .and_then(|_| archivo.flush())
            .map_err(|e| format!("no se pudo escribir la bitácora: {e}"))
    }

    pub fn agregar_uno(&self, evento: Value) {
        if let Err(error) = self.agregar(&[evento]) {
            log::error!("bitácora: {error}");
        }
    }

    /// Siguiente archivo de stderr del núcleo.
    pub fn anotar_stderr(&self, texto: impl Into<String>) {
        self.agregar_uno(json!({"tipo": "nucleo_stderr", "texto": texto.into()}));
    }

    pub fn exportar(
        &self,
        destino: &Path,
        todas: bool,
        incluir_ifc: bool,
        ruta_ifc: Option<&Path>,
    ) -> Result<(), String> {
        let dir = self
            .dir()
            .ok_or_else(|| "la bitácora todavía no tiene carpeta".to_string())?;
        if let Some(padre) = destino.parent() {
            if !padre.as_os_str().is_empty() {
                fs::create_dir_all(padre).map_err(|e| e.to_string())?;
            }
        }
        let archivo = File::create(destino)
            .map_err(|e| format!("no se pudo crear {}: {e}", destino.display()))?;
        let mut zip = zip::ZipWriter::new(archivo);
        let opciones = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        let sesiones = sesiones_ordenadas(&dir);
        let elegidas: Vec<PathBuf> = if todas {
            sesiones.clone()
        } else {
            sesiones
                .iter()
                .rev()
                .take(3)
                .rev()
                .cloned()
                .collect()
        };
        for ruta in elegidas {
            let nombre = ruta
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| "sesion.jsonl".into());
            escribir_zip(&mut zip, &format!("sesiones/{nombre}"), &ruta, opciones)?;
        }

        let logs = dir.parent().unwrap_or(&dir);
        let log = logs.join(NOMBRE_LOG);
        if log.is_file() {
            escribir_zip(&mut zip, NOMBRE_LOG, &log, opciones)?;
        }

        let sistema = self
            .sistema
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .unwrap_or_else(|| {
                json!({
                    "ts": ahora_iso(),
                    "sesion": self.sesion,
                    "tipo": "inicio",
                    "version": env!("CARGO_PKG_VERSION"),
                    "so": std::env::consts::OS,
                    "arquitectura": std::env::consts::ARCH,
                })
            });
        zip.start_file("sistema.json", opciones)
            .map_err(|e| e.to_string())?;
        zip.write_all(serde_json::to_string_pretty(&sistema).unwrap_or_default().as_bytes())
            .map_err(|e| e.to_string())?;

        if incluir_ifc {
            if let Some(ruta) = ruta_ifc.filter(|r| r.is_file()) {
                let nombre = ruta
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "modelo.ifc".into());
                escribir_zip(&mut zip, &format!("modelo/{nombre}"), ruta, opciones)?;
            }
        }

        zip.finish().map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn escribir_zip(
    zip: &mut zip::ZipWriter<File>,
    nombre: &str,
    ruta: &Path,
    opciones: SimpleFileOptions,
) -> Result<(), String> {
    let mut entrada =
        File::open(ruta).map_err(|e| format!("no se pudo leer {}: {e}", ruta.display()))?;
    let mut contenido = Vec::new();
    entrada
        .read_to_end(&mut contenido)
        .map_err(|e| e.to_string())?;
    zip.start_file(nombre, opciones)
        .map_err(|e| e.to_string())?;
    zip.write_all(&contenido).map_err(|e| e.to_string())
}

/// Eventos ISO 8601 con milisegundos, en UTC.
pub fn ahora_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn carpeta_de_logs(app: &AppHandle) -> PathBuf {
    // En pruebas y capturas se aísla todo (config, OPEN-RVT.log y bitácora).
    #[cfg(debug_assertions)]
    if let Ok(dir) = std::env::var("OPENRVT_DATOS_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir).join("logs");
        }
    }
    app.path().app_log_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn sesiones_ordenadas(dir: &Path) -> Vec<PathBuf> {
    let mut lista: Vec<PathBuf> = fs::read_dir(dir)
        .map(|entradas| {
            entradas
                .filter_map(Result::ok)
                .map(|e| e.path())
                .filter(|p| {
                    p.extension()
                        .is_some_and(|ext| ext.eq_ignore_ascii_case("jsonl"))
                })
                .collect()
        })
        .unwrap_or_default();
    // El nombre empieza por fecha y hora: el orden alfabético es el cronológico.
    lista.sort();
    lista
}

/// Conserva las últimas 20 sesiones sin pasar de 50 MB; borra las más viejas.
pub fn rotar(dir: &Path) -> Result<(), String> {
    rotar_con(dir, MAX_SESIONES, MAX_BYTES)
}

fn rotar_con(dir: &Path, max_sesiones: usize, max_bytes: u64) -> Result<(), String> {
    let mut sesiones = sesiones_ordenadas(dir);
    let mut total: u64 = sesiones
        .iter()
        .filter_map(|p| fs::metadata(p).ok().map(|m| m.len()))
        .sum();
    // Nunca se borra la sesión más nueva, aunque sola pase del límite.
    while sesiones.len() > 1
        && (sesiones.len() > max_sesiones || (max_bytes > 0 && total > max_bytes))
    {
        let vieja = sesiones.remove(0);
        total = total.saturating_sub(fs::metadata(&vieja).map(|m| m.len()).unwrap_or(0));
        fs::remove_file(&vieja)
            .map_err(|e| format!("no se pudo borrar {}: {e}", vieja.display()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::ZipArchive;

    fn temporal(nombre: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "openrvt-bitacora-{}-{nombre}",
            std::process::id()
        ));
        fs::remove_dir_all(&dir).ok();
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn rota_y_borra_las_sesiones_mas_viejas() {
        let dir = temporal("rotacion");
        for i in 0..25 {
            fs::write(
                dir.join(format!("20260101_000000_{i:02}.jsonl")),
                b"{\"tipo\":\"inicio\"}\n",
            )
            .unwrap();
        }
        rotar(&dir).unwrap();
        let quedan: Vec<String> = sesiones_ordenadas(&dir)
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(quedan.len(), MAX_SESIONES);
        assert_eq!(quedan.first().unwrap(), "20260101_000000_05.jsonl");
        assert_eq!(quedan.last().unwrap(), "20260101_000000_24.jsonl");
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rota_por_tamano_sin_borrar_la_sesion_actual() {
        let dir = temporal("tamano");
        for i in 0..5 {
            fs::write(
                dir.join(format!("20260101_000000_{i:02}.jsonl")),
                vec![b'x'; 60],
            )
            .unwrap();
        }
        rotar_con(&dir, MAX_SESIONES, 130).unwrap();
        let quedan = sesiones_ordenadas(&dir);
        assert_eq!(quedan.len(), 2);
        assert!(quedan
            .last()
            .unwrap()
            .to_string_lossy()
            .ends_with("_04.jsonl"));
        let total: u64 = quedan
            .iter()
            .map(|p| fs::metadata(p).unwrap().len())
            .sum();
        assert!(total <= 130);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn el_zip_lleva_sesiones_log_sistema_y_el_ifc_opcional() {
        let base = temporal("zip");
        let dir = base.join("bitacora");
        fs::create_dir_all(&dir).unwrap();
        for i in 0..4 {
            fs::write(
                dir.join(format!("20260101_000000_0{i}.jsonl")),
                format!("{{\"tipo\":\"clic\",\"n\":{i}}}\n"),
            )
            .unwrap();
        }
        std::fs::write(base.join("OPEN-RVT.log"), b"linea de log\n").unwrap();
        let bitacora = Bitacora::de_prueba(dir.clone(), "20260101_000000_04");
        bitacora
            .agregar(&[json!({
                "tipo": "inicio", "version": "0.5.1", "so": "linux",
                "arquitectura": "x86_64", "python": "3.12", "ifcopenshell": "0.9",
                "idioma": "es", "pantalla": "1600x900"})])
            .unwrap();
        let ifc = dir.join("casa.ifc");
        fs::write(&ifc, b"ISO-10303-21;\n").unwrap();

        let destino = dir.join("salida.zip");
        bitacora
            .exportar(&destino, false, true, Some(&ifc))
            .unwrap();

        let mut zip = ZipArchive::new(File::open(&destino).unwrap()).unwrap();
        let nombres: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect();
        // Por omisión: la actual y las dos anteriores; no la cuarta.
        assert!(nombres.contains(&"sesiones/20260101_000000_04.jsonl".to_string()));
        assert!(nombres.contains(&"sesiones/20260101_000000_02.jsonl".to_string()));
        assert!(!nombres.contains(&"sesiones/20260101_000000_01.jsonl".to_string()));
        assert!(nombres.contains(&"OPEN-RVT.log".to_string()));
        assert!(nombres.contains(&"sistema.json".to_string()));
        assert!(nombres.contains(&"modelo/casa.ifc".to_string()));

        let mut sistema = String::new();
        zip.by_name("sistema.json")
            .unwrap()
            .read_to_string(&mut sistema)
            .unwrap();
        let valor: Value = serde_json::from_str(&sistema).unwrap();
        assert_eq!(valor["tipo"], "inicio");
        assert_eq!(valor["ifcopenshell"], "0.9");

        // «Todas» incluye la más vieja y sin la casilla no va el modelo.
        let destino_todas = dir.join("todas.zip");
        bitacora
            .exportar(&destino_todas, true, false, Some(&ifc))
            .unwrap();
        let mut zip = ZipArchive::new(File::open(&destino_todas).unwrap()).unwrap();
        let nombres: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect();
        assert!(nombres.contains(&"sesiones/20260101_000000_00.jsonl".to_string()));
        assert!(nombres.iter().all(|n| !n.starts_with("modelo/")));

        fs::remove_dir_all(&base).ok();
    }
}
