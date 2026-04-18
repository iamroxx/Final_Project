from app import create_app


app = create_app()


if __name__ == "__main__":
    host = app.config.get("HOST", "0.0.0.0")
    port = int(app.config.get("PORT", 5000))
    app.run(host=host, port=port, debug=app.config.get("DEBUG", False))
