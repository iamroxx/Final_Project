from app import create_app
from app.extensions import socketio


app = create_app()


if __name__ == "__main__":
    host = app.config.get("HOST", "0.0.0.0")
    port = int(app.config.get("PORT", 5000))
    socketio.run(
        app,
        host=host,
        port=port,
        debug=app.config.get("DEBUG", False),
        allow_unsafe_werkzeug=True,
    )
