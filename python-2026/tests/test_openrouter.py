from types import SimpleNamespace

from services.ai_service import AiService
from utils import openrouter


def _fake_client(captured: dict):
    def create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{}'))],
            usage=None,
        )

    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )


def test_run_openrouter_uses_environment_default_when_max_tokens_is_omitted(
    monkeypatch,
) -> None:
    captured = {}
    monkeypatch.setenv("OPENROUTER_MAX_TOKENS", "1777")
    monkeypatch.setattr(openrouter, "_get_client", lambda: _fake_client(captured))

    assert openrouter.run_openrouter("prompt", timeout=10) == "{}"
    assert captured["max_tokens"] == 1777


def test_run_openrouter_accepts_an_optional_max_tokens_override(monkeypatch) -> None:
    captured = {}
    monkeypatch.setenv("OPENROUTER_MAX_TOKENS", "1777")
    monkeypatch.setattr(openrouter, "_get_client", lambda: _fake_client(captured))

    assert openrouter.run_openrouter("prompt", timeout=10, max_tokens=3000) == "{}"
    assert captured["max_tokens"] == 3000


def test_ai_service_does_not_pass_max_tokens_when_it_is_omitted(
    monkeypatch,
    tmp_path,
) -> None:
    calls = []

    def legacy_compatible_run(prompt: str, timeout: int):
        calls.append({"prompt": prompt, "timeout": timeout})
        return "{}"

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("services.ai_service.run_openrouter", legacy_compatible_run)

    assert AiService().generate_json(prompt="prompt", timeout=12) == {}
    assert calls == [{"prompt": "prompt", "timeout": 12}]
