"""
Backend del prototipo "Huellas al Lodo"
---------------------------------------
Estructura principal basada en diccionarios de Python (REPORTS_DB e IMAGES_DB)
para vincular cada reporte ciudadano con su identificador de imagen (image_id),
coordenadas geográficas (lat, lng) y antecedentes de los animales y microbasurales
en La Cisterna.
"""

import base64
import datetime
import http.server
import json
import os
import re
import socketserver
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
DATA_FILE = os.path.join(BASE_DIR, "reports_store.json")


def load_dotenv_file(dotenv_path: str) -> None:
    """Carga variables clave=valor desde un archivo .env o .env.example local."""
    if not os.path.exists(dotenv_path):
        return
    try:
        with open(dotenv_path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if (
                    key
                    and val
                    and val != "TU_API_KEY_DE_GOOGLE_MAPS_AQUI"
                    and not os.environ.get(key)
                ):
                    os.environ[key] = val
    except OSError:
        pass


DEFAULT_FIREBASE_DB_URL = "https://huellas-al-lodo-default-rtdb.firebaseio.com"


def get_firebase_db_url() -> str:
    url = os.environ.get("FIREBASE_DB_URL", "").strip().rstrip("/")
    if url in ("", "TU_FIREBASE_DB_URL_AQUI"):
        return DEFAULT_FIREBASE_DB_URL
    return url


def sync_runtime_config_js() -> None:
    """Genera un archivo local (ignorado en git) para que file:// también pueda leer la configuración."""
    runtime_js_path = os.path.join(BASE_DIR, "runtime-config.js")
    key = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
    fb_url = get_firebase_db_url()
    try:
        with open(runtime_js_path, "w", encoding="utf-8") as f:
            payload = json.dumps(
                {"googleMapsApiKey": key, "firebaseDbUrl": fb_url},
                ensure_ascii=False,
            )
            f.write(f"window.__HUELLAS_RUNTIME_CONFIG__ = {payload};\n")
    except OSError:
        pass


load_dotenv_file(os.path.join(BASE_DIR, ".env"))
load_dotenv_file(os.path.join(BASE_DIR, ".env.example"))
sync_runtime_config_js()

# =====================================================================
# 1. DICCIONARIO DE IMÁGENES (IMAGES_DB)
#    Vincula cada `image_id` con su archivo e información descriptiva.
# =====================================================================
IMAGES_DB: Dict[str, Dict[str, Any]] = {
    "IMG-001": {
        "image_id": "IMG-001",
        "filename": "IMG_7198.jpg",
        "url": "IMG_7198.jpg",
        "uploaded_at": "2026-10-14 11:20",
        "description": "Acumulación de bolsas y desechos en vereda con presencia de perros.",
    },
    "IMG-002": {
        "image_id": "IMG-002",
        "filename": "peuros.jpg",
        "url": "peuros.jpg",
        "uploaded_at": "2026-10-15 16:45",
        "description": "Perros callejeros buscando alimento entre bolsas rotas.",
    },
    "IMG-003": {
        "image_id": "IMG-003",
        "filename": "Peurros2.png",
        "url": "Peurros2.png",
        "uploaded_at": "2026-10-17 09:30",
        "description": "Foco persistente de residuos junto a animales sin supervisión.",
    },
}

# =====================================================================
# 2. DICCIONARIO PRINCIPAL DE REPORTES (REPORTS_DB)
#    Indexado por `report_id`. Vincula:
#      - image_id: clave hacia IMAGES_DB
#      - coordinates: {"lat": float | None, "lng": float | None}
#      - sector, reference, animal_type, animal_count, waste_level,
#        comment, status, created_at
# =====================================================================
REPORTS_DB: Dict[str, Dict[str, Any]] = {
    "REP-001": {
        "report_id": "REP-001",
        "image_id": "IMG-001",
        "coordinates": {
            "lat": -33.5268,
            "lng": -70.6614,
        },
        "sector": "El Parrón",
        "reference": "Vereda norte cerca de paradero de locomoción colectiva",
        "animal_type": "Perros",
        "animal_count": 2,
        "waste_level": "Alto",
        "comment": "Dos perros abriendo bolsas acumuladas en la esquina.",
        "status": "Activo",
        "created_at": "2026-10-14 11:20",
    },
    "REP-002": {
        "report_id": "REP-002",
        "image_id": "IMG-002",
        "coordinates": {
            "lat": -33.5342,
            "lng": -70.6695,
        },
        "sector": "Feria Libre / Interior Barrio",
        "reference": "Esquina de feria libre junto a contenedor",
        "animal_type": "Perros y gatos",
        "animal_count": 4,
        "waste_level": "Moderado",
        "comment": "El foco se repite después de cada jornada de feria y atrae animales del pasaje.",
        "status": "Activo",
        "created_at": "2026-10-15 16:45",
    },
    "REP-003": {
        "report_id": "REP-003",
        "image_id": "IMG-003",
        "coordinates": {
            "lat": -33.5389,
            "lng": -70.6632,
        },
        "sector": "Paradero / Eje Gran Avenida",
        "reference": "Costado de refugio peatonal junto a rejilla de alcantarillado",
        "animal_type": "Perros",
        "animal_count": 1,
        "waste_level": "Bajo",
        "comment": "Bolsas dispersas junto al paradero con un perro merodeando.",
        "status": "Activo",
        "created_at": "2026-10-17 09:30",
    },
}


# =====================================================================
# 3. FUNCIONES DE ACCESO Y MANIPULACIÓN DEL DICCIONARIO
# =====================================================================
def load_persisted_state() -> None:
    if not os.path.exists(DATA_FILE):
        return
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload.get("images"), dict):
            IMAGES_DB.update(payload["images"])
        if isinstance(payload.get("reports"), dict):
            REPORTS_DB.update(payload["reports"])
    except (OSError, json.JSONDecodeError):
        pass


def save_persisted_state(push_remote: bool = True) -> None:
    try:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(
                {"images": IMAGES_DB, "reports": REPORTS_DB},
                f,
                ensure_ascii=False,
                indent=2,
            )
    except OSError:
        pass
    if push_remote:
        push_to_firebase()


def _materialize_base64_images_locally() -> None:
    """Si desde Firebase llega una imagen en base64, guarda también el archivo físico en uploads/."""
    for img_id, info in list(IMAGES_DB.items()):
        if not isinstance(info, dict):
            continue
        url_val = str(info.get("url") or "")
        if url_val.startswith("data:image/") and "," in url_val:
            os.makedirs(UPLOADS_DIR, exist_ok=True)
            header, b64_data = url_val.split(",", 1)
            ext = "png" if "png" in header else ("webp" if "webp" in header else "jpg")
            filename = f"{img_id.lower()}.{ext}"
            filepath = os.path.join(UPLOADS_DIR, filename)
            if not os.path.exists(filepath):
                try:
                    with open(filepath, "wb") as f:
                        f.write(base64.b64decode(b64_data))
                except (OSError, ValueError):
                    pass
            info["filename"] = filename


def pull_from_firebase() -> bool:
    """Descarga los diccionarios IMAGES_DB y REPORTS_DB desde Firebase Realtime Database."""
    fb_url = get_firebase_db_url()
    if not fb_url:
        return False
    endpoint = f"{fb_url}/huellas_state.json"
    try:
        req = urllib.request.Request(endpoint, method="GET")
        with urllib.request.urlopen(req, timeout=4) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw) if raw else None
        if isinstance(data, dict):
            changed = False
            if isinstance(data.get("images"), dict):
                IMAGES_DB.update(data["images"])
                changed = True
            if isinstance(data.get("reports"), dict):
                REPORTS_DB.update(data["reports"])
                changed = True
            if changed:
                _materialize_base64_images_locally()
                save_persisted_state(push_remote=False)
            return True
        elif data is None:
            # Si Firebase está vacío por primera vez, inicialízalo con los datos actuales
            push_to_firebase()
            return True
    except (urllib.error.URLError, json.JSONDecodeError, OSError, ValueError):
        pass
    return False


def push_to_firebase() -> bool:
    """Sube el estado actual de IMAGES_DB y REPORTS_DB a Firebase Realtime Database."""
    fb_url = get_firebase_db_url()
    if not fb_url:
        return False
    endpoint = f"{fb_url}/huellas_state.json"
    try:
        body = json.dumps(
            {"images": IMAGES_DB, "reports": REPORTS_DB},
            ensure_ascii=False,
        ).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=body,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="PUT",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, OSError, ValueError):
        return False


def _next_id(prefix: str, target_dict: Dict[str, Any]) -> str:
    max_num = 0
    for key in target_dict.keys():
        match = re.search(r"(\d+)$", key)
        if match:
            max_num = max(max_num, int(match.group(1)))
    return f"{prefix}-{max_num + 1:03d}"


def get_enriched_report(report_id: str) -> Optional[Dict[str, Any]]:
    report = REPORTS_DB.get(report_id)
    if not report:
        return None
    image_id = report.get("image_id", "")
    image_info = IMAGES_DB.get(
        image_id,
        {
            "image_id": image_id or "IMG-001",
            "filename": "IMG_7198.jpg",
            "url": "IMG_7198.jpg",
            "description": "Fotografía de reporte",
        },
    )
    enriched = dict(report)
    enriched["image"] = image_info
    return enriched


def get_all_reports_payload() -> Dict[str, Any]:
    enriched_list = [
        get_enriched_report(rid)
        for rid in sorted(REPORTS_DB.keys(), reverse=True)
    ]
    return {
        "reports_dict": REPORTS_DB,
        "images_dict": IMAGES_DB,
        "reports_list": [r for r in enriched_list if r is not None],
    }


def register_image(
    image_data_url: Optional[str] = None,
    existing_image_id: Optional[str] = None,
    description: str = "",
) -> str:
    if existing_image_id and existing_image_id in IMAGES_DB:
        return existing_image_id

    new_img_id = _next_id("IMG", IMAGES_DB)
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    if image_data_url and image_data_url.startswith("data:image/"):
        os.makedirs(UPLOADS_DIR, exist_ok=True)
        header, b64_data = image_data_url.split(",", 1)
        ext = "jpg"
        if "png" in header:
            ext = "png"
        elif "webp" in header:
            ext = "webp"
        filename = f"{new_img_id.lower()}.{ext}"
        filepath = os.path.join(UPLOADS_DIR, filename)
        try:
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(b64_data))
            # Mantenemos el data URL para que también se vea en GitHub Pages / otros dispositivos vía Firebase
            rel_url = image_data_url
        except (OSError, ValueError):
            filename = "IMG_7198.jpg"
            rel_url = "IMG_7198.jpg"
    else:
        filename = "IMG_7198.jpg"
        rel_url = "IMG_7198.jpg"

    IMAGES_DB[new_img_id] = {
        "image_id": new_img_id,
        "filename": filename,
        "url": rel_url,
        "uploaded_at": now_str,
        "description": description or f"Fotografía ciudadana ({new_img_id})",
    }
    return new_img_id


def create_report(payload: Dict[str, Any]) -> Dict[str, Any]:
    new_rep_id = _next_id("REP", REPORTS_DB)
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    coords_in = payload.get("coordinates") or {}
    lat = coords_in.get("lat")
    lng = coords_in.get("lng")
    try:
        lat = round(float(lat), 6) if lat is not None and lat != "" else None
        lng = round(float(lng), 6) if lng is not None and lng != "" else None
    except (TypeError, ValueError):
        lat, lng = None, None

    image_id = register_image(
        image_data_url=payload.get("image_data_url"),
        existing_image_id=payload.get("image_id"),
        description=payload.get("reference", ""),
    )

    REPORTS_DB[new_rep_id] = {
        "report_id": new_rep_id,
        "image_id": image_id,
        "coordinates": {
            "lat": lat,
            "lng": lng,
        },
        "sector": str(payload.get("sector") or "El Parrón").strip(),
        "reference": str(payload.get("reference") or "Sin referencia específica").strip(),
        "animal_type": str(payload.get("animal_type") or "Perros").strip(),
        "animal_count": max(1, int(payload.get("animal_count") or 1)),
        "waste_level": str(payload.get("waste_level") or "Alto").strip(),
        "comment": str(payload.get("comment") or "").strip(),
        "status": "Activo",
        "created_at": now_str,
    }

    save_persisted_state()
    return get_enriched_report(new_rep_id) or REPORTS_DB[new_rep_id]


def update_report_coordinates(report_id: str, lat: float, lng: float) -> Optional[Dict[str, Any]]:
    if report_id not in REPORTS_DB:
        return None
    REPORTS_DB[report_id]["coordinates"] = {
        "lat": round(float(lat), 6),
        "lng": round(float(lng), 6),
    }
    save_persisted_state()
    return get_enriched_report(report_id)


load_persisted_state()
pull_from_firebase()


# =====================================================================
# 4. SERVIDOR HTTP + ENDPOINTS REST
# =====================================================================
class HuellasRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def _send_json(self, status_code: int, data: Any) -> None:
        raw = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/config":
            load_dotenv_file(os.path.join(BASE_DIR, ".env"))
            load_dotenv_file(os.path.join(BASE_DIR, ".env.example"))
            self._send_json(
                200,
                {
                    "googleMapsApiKey": os.environ.get("GOOGLE_MAPS_API_KEY", ""),
                    "hasKey": bool(os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()),
                    "firebaseDbUrl": get_firebase_db_url(),
                },
            )
            return

        if parsed.path == "/api/reports":
            pull_from_firebase()
            self._send_json(200, get_all_reports_payload())
            return

        if parsed.path == "/api/images":
            self._send_json(200, {"images_dict": IMAGES_DB})
            return

        super().do_GET()

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        body_bytes = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(body_bytes.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json(400, {"error": "JSON inválido"})
            return

        if parsed.path == "/api/reports":
            if not payload.get("image_data_url") and not payload.get("image_id"):
                self._send_json(400, {"error": "Debes adjuntar una fotografía para publicar el reporte."})
                return
            created = create_report(payload)
            self._send_json(
                201,
                {
                    "ok": True,
                    "report": created,
                    "state": get_all_reports_payload(),
                },
            )
            return

        if parsed.path == "/api/reports/coordinates":
            rep_id = str(payload.get("report_id") or "")
            lat = payload.get("lat")
            lng = payload.get("lng")
            if not rep_id or lat is None or lng is None:
                self._send_json(400, {"error": "Faltan report_id, lat o lng"})
                return
            updated = update_report_coordinates(rep_id, float(lat), float(lng))
            if not updated:
                self._send_json(404, {"error": "Reporte no encontrado"})
                return
            self._send_json(
                200,
                {
                    "ok": True,
                    "report": updated,
                    "state": get_all_reports_payload(),
                },
            )
            return

        if parsed.path == "/api/config/key":
            api_key = str(payload.get("googleMapsApiKey") or "").strip()
            os.environ["GOOGLE_MAPS_API_KEY"] = api_key
            self._send_json(200, {"ok": True, "hasKey": bool(api_key)})
            return

        self._send_json(404, {"error": "Ruta no encontrada"})


def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((host, port), HuellasRequestHandler) as httpd:
        actual_port = httpd.server_address[1]
        print(f"Servidor Huellas al Lodo activo en http://{host}:{actual_port}/reportar.html")
        httpd.serve_forever()


if __name__ == "__main__":
    run_server()
