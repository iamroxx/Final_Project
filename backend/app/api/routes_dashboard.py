from flask import Blueprint, render_template


dashboard_bp = Blueprint(
    "dashboard",
    __name__,
    template_folder="../templates",
)


@dashboard_bp.get("/")
def index_page():
    return render_template("index.html")


@dashboard_bp.get("/dashboard")
def dashboard_page():
    return render_template("index.html")
