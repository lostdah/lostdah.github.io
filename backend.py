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
import hashlib
import hmac
import http.server
import json
import math
import os
import re
import socketserver
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
DATA_FILE = os.path.join(BASE_DIR, "reports_store.json")

# Hash de verificación del token de sesión (SHA-256 de "huellas-token-check-v2:" + token).
# Ni la contraseña ni el token viajan ni se almacenan en texto plano en el código fuente.
ADMIN_TOKEN_CHECK_HASH = "1899e27ac89d9aa6af3b58cefacbb3d3f913c5cb71929c4db65d351a9bd6dc38"
STATE_LOCK = threading.RLock()
_LAST_FIREBASE_PULL_TS = 0.0


def load_dotenv_file(dotenv_path: str) -> None:
    """Carga variables clave=valor desde el archivo .env local."""
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


load_dotenv_file(os.path.join(BASE_DIR, ".env"))
try:
    _legacy_runtime_js = os.path.join(BASE_DIR, "runtime-config.js")
    if os.path.exists(_legacy_runtime_js):
        os.remove(_legacy_runtime_js)
except OSError:
    pass

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
        with STATE_LOCK:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                payload = json.load(f)
            if isinstance(payload.get("images"), dict) and payload["images"]:
                IMAGES_DB.clear()
                IMAGES_DB.update(payload["images"])
            if isinstance(payload.get("reports"), dict) and payload["reports"]:
                REPORTS_DB.clear()
                REPORTS_DB.update(payload["reports"])
    except (OSError, json.JSONDecodeError):
        pass


def save_persisted_state(push_remote: bool = True) -> None:
    try:
        with STATE_LOCK:
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
    with STATE_LOCK:
        for img_id, info in list(IMAGES_DB.items()):
            if not isinstance(info, dict):
                continue
            url_val = str(info.get("url") or "")
            if url_val.startswith("data:image/") and "," in url_val:
                os.makedirs(UPLOADS_DIR, exist_ok=True)
                header, b64_data = url_val.split(",", 1)
                ext = "png" if "png" in header else ("webp" if "webp" in header else "jpg")
                safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(img_id)).lower() or "img"
                filename = f"{safe_id}.{ext}"
                filepath = os.path.join(UPLOADS_DIR, filename)
                if not os.path.exists(filepath):
                    try:
                        with open(filepath, "wb") as f:
                            f.write(base64.b64decode(b64_data))
                    except (OSError, ValueError):
                        pass
                info["filename"] = filename


def pull_from_firebase(force: bool = False) -> bool:
    """Descarga los diccionarios IMAGES_DB y REPORTS_DB desde Firebase Realtime Database."""
    global _LAST_FIREBASE_PULL_TS
    now = time.monotonic()
    if not force and (now - _LAST_FIREBASE_PULL_TS) < 4.0:
        return True
    fb_url = get_firebase_db_url()
    if not fb_url:
        return False
    endpoint = f"{fb_url}/huellas_state.json"
    try:
        req = urllib.request.Request(endpoint, method="GET")
        with urllib.request.urlopen(req, timeout=4) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw) if raw else None
        _LAST_FIREBASE_PULL_TS = now
        if isinstance(data, dict):
            with STATE_LOCK:
                changed = False
                if isinstance(data.get("images"), dict):
                    IMAGES_DB.clear()
                    IMAGES_DB.update(data["images"])
                    changed = True
                if isinstance(data.get("reports"), dict):
                    REPORTS_DB.clear()
                    REPORTS_DB.update(data["reports"])
                    changed = True
                if changed:
                    _materialize_base64_images_locally()
                    save_persisted_state(push_remote=False)
            return True
        elif data is None:
            push_to_firebase()
            return True
    except (urllib.error.URLError, json.JSONDecodeError, OSError, ValueError):
        pass
    return False


def push_to_firebase() -> bool:
    """Sincroniza el estado actual de IMAGES_DB y REPORTS_DB en Firebase usando PATCH granular."""
    fb_url = get_firebase_db_url()
    if not fb_url:
        return False
    endpoint = f"{fb_url}/huellas_state.json"
    try:
        with STATE_LOCK:
            body = json.dumps(
                {"images": IMAGES_DB, "reports": REPORTS_DB},
                ensure_ascii=False,
            ).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=body,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="PATCH",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, OSError, ValueError):
        return False


def _firebase_delete_path(subpath: str) -> bool:
    fb_url = get_firebase_db_url()
    if not fb_url:
        return False
    endpoint = f"{fb_url}/huellas_state/{subpath.lstrip('/')}.json"
    try:
        req = urllib.request.Request(endpoint, method="DELETE")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, OSError, ValueError):
        return False


def _next_id(prefix: str, target_dict: Dict[str, Any]) -> str:
    max_num = 0
    for key in target_dict.keys():
        match = re.search(r"(\d+)$", str(key))
        if match:
            max_num = max(max_num, int(match.group(1)))
    return f"{prefix}-{max_num + 1:03d}"


def get_enriched_report(report_id: str) -> Optional[Dict[str, Any]]:
    with STATE_LOCK:
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
    with STATE_LOCK:
        enriched_list = [
            get_enriched_report(rid)
            for rid in sorted(REPORTS_DB.keys(), reverse=True)
        ]
        return {
            "reports_dict": dict(REPORTS_DB),
            "images_dict": dict(IMAGES_DB),
            "reports_list": [r for r in enriched_list if r is not None],
        }


def register_image(
    image_data_url: Optional[str] = None,
    existing_image_id: Optional[str] = None,
    description: str = "",
) -> str:
    with STATE_LOCK:
        if existing_image_id and str(existing_image_id) in IMAGES_DB:
            return str(existing_image_id)

        new_img_id = _next_id("IMG", IMAGES_DB)
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

        if isinstance(image_data_url, str) and image_data_url.startswith("data:image/") and "," in image_data_url:
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
            "description": str(description or f"Fotografía ciudadana ({new_img_id})")[:250],
        }
        return new_img_id


def create_report(payload: Dict[str, Any]) -> Dict[str, Any]:
    pull_from_firebase(force=True)
    with STATE_LOCK:
        new_rep_id = _next_id("REP", REPORTS_DB)
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

        coords_in = payload.get("coordinates")
        if not isinstance(coords_in, dict):
            coords_in = {}
        lat_raw = coords_in.get("lat")
        lng_raw = coords_in.get("lng")
        try:
            lat = round(float(lat_raw), 6) if lat_raw is not None and lat_raw != "" else None
            lng = round(float(lng_raw), 6) if lng_raw is not None and lng_raw != "" else None
            if lat is not None and (not math.isfinite(lat) or not (-90.0 <= lat <= 90.0)):
                lat = None
            if lng is not None and (not math.isfinite(lng) or not (-180.0 <= lng <= 180.0)):
                lng = None
        except (TypeError, ValueError):
            lat, lng = None, None

        try:
            animal_count = max(1, min(99, int(payload.get("animal_count") or 1)))
        except (TypeError, ValueError):
            animal_count = 1

        image_id = register_image(
            image_data_url=payload.get("image_data_url"),
            existing_image_id=payload.get("image_id"),
            description=str(payload.get("reference") or ""),
        )

        REPORTS_DB[new_rep_id] = {
            "report_id": new_rep_id,
            "image_id": image_id,
            "coordinates": {
                "lat": lat,
                "lng": lng,
            },
            "sector": str(payload.get("sector") or "El Parrón").strip()[:150],
            "reference": str(payload.get("reference") or "Sin referencia específica").strip()[:250],
            "animal_type": str(payload.get("animal_type") or "Perros").strip()[:100],
            "animal_count": animal_count,
            "waste_level": str(payload.get("waste_level") or "Alto").strip()[:50],
            "comment": str(payload.get("comment") or "").strip()[:1000],
            "status": "Activo",
            "created_at": now_str,
        }

        save_persisted_state()
        return get_enriched_report(new_rep_id) or REPORTS_DB[new_rep_id]


def update_report_coordinates(report_id: str, lat: float, lng: float) -> Optional[Dict[str, Any]]:
    if not (math.isfinite(lat) and math.isfinite(lng) and -90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        return None
    with STATE_LOCK:
        if report_id not in REPORTS_DB:
            return None
        REPORTS_DB[report_id]["coordinates"] = {
            "lat": round(float(lat), 6),
            "lng": round(float(lng), 6),
        }
        save_persisted_state()
        return get_enriched_report(report_id)


def delete_report(report_id: str) -> bool:
    """Elimina un reporte y su imagen (si no está usada en otro reporte) tanto local como remotamente."""
    with STATE_LOCK:
        if report_id not in REPORTS_DB:
            return False
        rep = REPORTS_DB.pop(report_id, None)
        removed_img_id = None
        if rep:
            img_id = rep.get("image_id")
            if img_id and img_id in IMAGES_DB:
                still_used = any(r.get("image_id") == img_id for r in REPORTS_DB.values())
                if not still_used:
                    IMAGES_DB.pop(img_id, None)
                    removed_img_id = img_id
        save_persisted_state(push_remote=False)

    safe_rep = urllib.parse.quote(report_id, safe="")
    _firebase_delete_path(f"reports/{safe_rep}")
    if removed_img_id:
        safe_img = urllib.parse.quote(str(removed_img_id), safe="")
        _firebase_delete_path(f"images/{safe_img}")
    return True


load_persisted_state()
pull_from_firebase(force=True)


# =====================================================================
# 4. SERVIDOR HTTP + ENDPOINTS REST
# =====================================================================
class HuellasRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    @staticmethod
    def _verify_token(candidate: str) -> bool:
        if not candidate or len(candidate) > 256:
            return False
        env_token = os.environ.get("HUELLAS_ADMIN_TOKEN", "").strip()
        if env_token and hmac.compare_digest(candidate, env_token):
            return True
        token_check = hashlib.sha256(f"huellas-token-check-v2:{candidate}".encode("utf-8")).hexdigest()
        return hmac.compare_digest(token_check, ADMIN_TOKEN_CHECK_HASH)

    def _is_admin_authenticated(self) -> bool:
        token = self.headers.get("X-Huellas-Admin-Token", "").strip()
        if self._verify_token(token):
            return True
        auth = self.headers.get("Authorization", "").strip()
        if auth.startswith("Bearer "):
            val = auth[7:].strip()
            if self._verify_token(val):
                return True
        return False

    def _get_allowed_origin(self) -> str:
        origin = self.headers.get("Origin", "").strip()
        if not origin:
            return ""
        server_port = self.server.server_address[1] if hasattr(self, "server") and self.server else 8000
        allowed_locals = {
            f"http://127.0.0.1:{server_port}",
            f"http://localhost:{server_port}",
            "http://127.0.0.1:8000",
            "http://localhost:8000",
            "https://lostdah.github.io",
        }
        if origin in allowed_locals:
            return origin
        return "null"

    def end_headers(self) -> None:
        origin = self._get_allowed_origin()
        if origin and origin != "null":
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Huellas-Admin-Token, Authorization")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
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

    @staticmethod
    def _is_sensitive_filename(name_or_path: str) -> bool:
        path_decoded = urllib.parse.unquote(name_or_path.lstrip("/").replace("\\", "/"))
        filename = path_decoded.split("/")[-1].lower()
        return (
            filename.startswith(".")
            or filename.endswith(".py")
            or filename in ("reports_store.json", "firebase.rules.json")
            or "__pycache__" in path_decoded
            or ".." in path_decoded
        )

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)

        # 1. Protección contra acceso no autorizado a archivos sensibles del servidor (403 Forbidden)
        if self._is_sensitive_filename(parsed.path) and not self._is_admin_authenticated():
            self._send_json(
                403,
                {
                    "error": "403 Forbidden",
                    "message": "Acceso denegado a archivos protegidos del servidor. Se requieren credenciales de administrador.",
                },
            )
            return

        if parsed.path == "/api/config":
            load_dotenv_file(os.path.join(BASE_DIR, ".env"))
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
            pull_from_firebase(force=False)
            self._send_json(200, get_all_reports_payload())
            return

        if parsed.path == "/api/images":
            with STATE_LOCK:
                self._send_json(200, {"images_dict": dict(IMAGES_DB)})
            return

        if parsed.path == "/api/files":
            is_admin = self._is_admin_authenticated()
            file_list = []
            try:
                for entry in os.scandir(BASE_DIR):
                    if entry.name.startswith(".git") or entry.name == "__pycache__":
                        continue
                    if not is_admin and self._is_sensitive_filename(entry.name):
                        continue
                    is_dir = entry.is_dir()
                    stat = entry.stat()
                    file_list.append({
                        "name": entry.name,
                        "is_dir": is_dir,
                        "size": stat.st_size if not is_dir else 4096,
                        "mtime": stat.st_mtime,
                    })
                file_list.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
            except Exception:
                file_list = []
            self._send_json(200, {"files": file_list})
            return

        super().do_GET()

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1

        if length < 0:
            self._send_json(400, {"error": "400 Bad Request: Content-Length inválido."})
            return

        # Limitar tamaño de carga a 10 MB para mitigar ataques DoS / OOM
        MAX_PAYLOAD_BYTES = 10 * 1024 * 1024
        if length > MAX_PAYLOAD_BYTES:
            self._send_json(413, {"error": "413 Payload Too Large: El tamaño excede el límite permitido de 10 MB."})
            return

        body_bytes = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(body_bytes.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json(400, {"error": "JSON inválido"})
            return

        if not isinstance(payload, dict):
            self._send_json(400, {"error": "El cuerpo JSON debe ser un objeto."})
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
            rep_id = str(payload.get("report_id") or "").strip()
            lat = payload.get("lat")
            lng = payload.get("lng")
            if not rep_id or lat is None or lng is None:
                self._send_json(400, {"error": "Faltan report_id, lat o lng"})
                return
            try:
                lat_f = float(lat)
                lng_f = float(lng)
            except (TypeError, ValueError):
                self._send_json(400, {"error": "Coordenadas lat/lng inválidas"})
                return
            updated = update_report_coordinates(rep_id, lat_f, lng_f)
            if not updated:
                self._send_json(404, {"error": "Reporte no encontrado o coordenadas fuera de rango"})
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
            if not self._is_admin_authenticated():
                self._send_json(403, {"error": "403 Forbidden: Acción administrativa no autorizada"})
                return
            api_key = str(payload.get("googleMapsApiKey") or "").strip()
            os.environ["GOOGLE_MAPS_API_KEY"] = api_key
            self._send_json(200, {"ok": True, "hasKey": bool(api_key)})
            return

        self._send_json(404, {"error": "Ruta no encontrada"})

    def do_DELETE(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        m = re.match(r"^/api/reports/([^/]+)$", parsed.path)
        if m:
            if not self._is_admin_authenticated():
                self._send_json(403, {"error": "403 Forbidden: Se requieren permisos de administrador para eliminar reportes"})
                return
            rep_id = urllib.parse.unquote(m.group(1))
            ok = delete_report(rep_id)
            if ok:
                self._send_json(200, {"ok": True, "state": get_all_reports_payload()})
            else:
                self._send_json(404, {"error": "Reporte no encontrado"})
            return
        self._send_json(404, {"error": "Ruta no encontrada"})


class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    with ThreadingHTTPServer((host, port), HuellasRequestHandler) as httpd:
        actual_port = httpd.server_address[1]
        print(f"Servidor Huellas al Lodo activo en http://{host}:{actual_port}/reportar.html")
        httpd.serve_forever()


if __name__ == "__main__":
    run_server()
