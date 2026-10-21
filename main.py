import os
import socketserver
import threading
import time
import webbrowser

from backend import HuellasRequestHandler

HOST = "127.0.0.1"
current_dir = os.path.abspath(os.path.dirname(__file__))

assigned_port = None
httpd = None


def start_server():
    global assigned_port, httpd
    os.chdir(current_dir)
    socketserver.TCPServer.allow_reuse_address = True

    with socketserver.TCPServer((HOST, 0), HuellasRequestHandler) as server:
        httpd = server
        assigned_port = server.server_address[1]
        server.serve_forever()


if __name__ == "__main__":
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    while assigned_port is None:
        time.sleep(0.1)

    url = f"http://{HOST}:{assigned_port}/prototipado.html"
    webbrowser.open(url)
    print(f"Servidor backend + frontend activo en {url}")
    print(f"Página directa del prototipo de reportes: http://{HOST}:{assigned_port}/reportar.html")

    try:
        input("Presiona Enter para detener el servidor...\n")
    except KeyboardInterrupt:
        pass

    if httpd:
        httpd.shutdown()
        print("Servidor apagado correctamente.")
