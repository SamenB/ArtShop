from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_ci_runs_backend_and_frontend_quality_gates():
    ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    assert "ruff check ." in ci
    assert "ruff format --check ." in ci
    assert "pytest -v" in ci
    assert "npm exec eslint ." in ci
    assert "npm exec tsc -- --noEmit" in ci
    assert "npm run build" in ci


def test_cd_uses_backend_prodigi_prepare_decider_instead_of_inline_path_grep():
    cd = (ROOT / ".github" / "workflows" / "cd.yml").read_text(encoding="utf-8")

    assert "src.integrations.prodigi.tasks.prodigi_should_prepare_production" in cd
    assert "PRODIGI_PREPARE_NEEDED=true" in cd
    assert "command_timeout: 60m" in cd
    assert "exec -T api" in cd
    assert "grep -E" not in cd
    assert "script_stop" not in cd


def test_manual_prodigi_prepare_workflow_is_not_duplicated_outside_admin():
    assert not (ROOT / ".github" / "workflows" / "prodigi-production-prepare.yml").exists()
