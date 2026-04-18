from flask import Flask

from .api.routes_health import health_bp
from .api.routes_ingest import ingest_bp
from .api.routes_session import session_bp
from .config import Config
from .extensions import init_extensions


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    init_extensions(app)

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(session_bp, url_prefix="/api/session")
    app.register_blueprint(ingest_bp, url_prefix="/api")

    return app
