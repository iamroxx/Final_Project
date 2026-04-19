from flask_cors import CORS
from flask_socketio import SocketIO


socketio = SocketIO(cors_allowed_origins="*")


def init_extensions(app):
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    socketio.init_app(app, cors_allowed_origins="*", async_mode="threading")
