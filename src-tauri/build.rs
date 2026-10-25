//! Script de construcción.
//!
//! En Windows, Tauri incrusta el manifiesto (comctl32 v6) solo en el binario de
//! la aplicación, no en el ejecutable de pruebas de la biblioteca, que por eso
//! falla al arrancar con 0xc0000139 (STATUS_ENTRYPOINT_NOT_FOUND). Se desactiva
//! el manifiesto automático y se incrusta el nuestro en todos los destinos
//! (binario y pruebas). En otras plataformas no cambia nada.
fn main() {
    let windows = std::env::var("CARGO_CFG_TARGET_OS").is_ok_and(|os| os == "windows");
    if windows {
        let attrs = tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        tauri_build::try_build(attrs).expect("fallo al ejecutar tauri-build");

        let manifiesto = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap())
            .join("windows-app.manifest");
        println!("cargo:rerun-if-changed={}", manifiesto.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg=/MANIFESTINPUT:{}",
            manifiesto.display()
        );
    } else {
        tauri_build::build();
    }
}
