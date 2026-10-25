import { tr } from "@/i18n";
// Lectura del logo de la empresa para el asistente de obra. Solo lee el archivo como
// data URL; Rust vuelve a validar tipo y tamaño (datos::repos::obra::validar_empresa_json).

/** Tamaño máximo del archivo de logo, en bytes. */
export const LOGO_MAX_BYTES = 512 * 1024;
const TIPOS_LOGO = ["image/png", "image/jpeg"];

export function validarArchivoLogo(f: { type: string; size: number }): string | null {
  if (!TIPOS_LOGO.includes(f.type)) return tr("comun.el-logo-debe-ser-una-imagen-png-o-jpeg", "El logo debe ser una imagen PNG o JPEG");
  if (f.size > LOGO_MAX_BYTES) return tr("comun.el-logo-es-demasiado-grande-maximo-512-kb", "El logo es demasiado grande (máximo 512 KB)");
  return null;
}

/** Lee el archivo como data URL (`data:image/png;base64,...`). */
export function leerLogo(f: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(new Error(tr("comun.noSePudoLeerLogo", "No se pudo leer el archivo del logo")));
    lector.readAsDataURL(f);
  });
}
