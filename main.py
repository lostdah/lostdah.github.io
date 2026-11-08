import os
import sys
import threading
import time
import webbrowser

from backend import HuellasRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PREFERRED_PORTS = [50137, 8080, 8000, 3000, 0]
current_dir = os.path.abspath(os.path.dirname(__file__))

assigned_port = None
httpd = None


def start_server():
    global assigned_port, httpd
    os.chdir(current_dir)

    for port in PREFERRED_PORTS:
        try:
            server = ThreadingHTTPServer((HOST, port), HuellasRequestHandler)
            httpd = server
            assigned_port = server.server_address[1]
            break
        except OSError:
            continue

    if httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    while assigned_port is None:
        time.sleep(0.05)

    url = f"http://{HOST}:{assigned_port}/prototipado.html"
    report_url = f"http://{HOST}:{assigned_port}/reportar.html"
    print(f"Servidor backend + frontend activo en {url}")
    print(f"Página directa del prototipo de reportes: {report_url}")

    if "--no-browser" not in sys.argv:
        try:
            webbrowser.open(report_url)
        except Exception:
            pass

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nDeteniendo servidor por Ctrl + C...")
    finally:
        if httpd:
            httpd.shutdown()
            print("Servidor apagado correctamente.")
