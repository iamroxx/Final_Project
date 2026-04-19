from flask import Flask
from flask_socketio import join_room

from .api.routes_dashboard import dashboard_bp
from .api.routes_health import health_bp
from .api.routes_ingest import ingest_bp
from .api.routes_session import session_bp
from .config import Config
from .extensions import init_extensions, socketio


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    init_extensions(app)

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(session_bp, url_prefix="/api/session")
    app.register_blueprint(ingest_bp, url_prefix="/api")
    app.register_blueprint(dashboard_bp)

    @socketio.on("subscribe_session", namespace="/metrics")
    def subscribe_session(data):
        session_id = str((data or {}).get("sessionId", "")).strip()
        if not session_id:
            return {"ok": False, "error": "sessionId is required"}
        join_room(session_id)
        return {"ok": True, "sessionId": session_id}

    return app
