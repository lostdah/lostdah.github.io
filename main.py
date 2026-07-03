import os
import threading
import http.server
import socketserver
import time
import webbrowser

HOST = "127.0.0.1"
current_dir = os.path.abspath(os.path.dirname(__file__))
Handler = http.server.SimpleHTTPRequestHandler

assigned_port = None
httpd = None 

def start_server():
    global assigned_port, httpd
    os.chdir(current_dir)
    socketserver.TCPServer.allow_reuse_address = True 
    
    with socketserver.TCPServer((HOST, 0), Handler) as httpd:
        assigned_port = httpd.server_address[1]
        httpd.serve_forever()
        
server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()

while assigned_port is None:
    time.sleep(0.1)

url = f'http://{HOST}:{assigned_port}/'
webbrowser.open(url)
print(f"Abriendo navegador en {url}")

try:
    input("Presiona Enter para detener el servidor...\n")
except KeyboardInterrupt:
    pass

if httpd:
    httpd.shutdown()
    print("Servidor apagado correctamente.")
