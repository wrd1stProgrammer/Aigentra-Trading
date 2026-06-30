import asyncio
import threading

import pytest

import app.main as main


@pytest.mark.asyncio
async def test_run_maybe_threaded_moves_sync_work_off_event_loop(monkeypatch):
    calls: list[tuple[str, tuple[int, ...]]] = []

    def sync_job(value):
        return value + 1

    async def fake_to_thread(func, *args, **kwargs):
        calls.append((func.__name__, args))
        return func(*args, **kwargs)

    monkeypatch.setattr(main.asyncio, "to_thread", fake_to_thread)

    result = await main.run_maybe_threaded(sync_job, 41)

    assert result == 42
    assert calls == [("sync_job", (41,))]


@pytest.mark.asyncio
async def test_auto_scanner_loop_runs_scanner_outside_api_event_loop(monkeypatch):
    current_loop = asyncio.get_running_loop()
    original_to_thread = asyncio.to_thread
    called = threading.Event()
    to_thread_calls: list[str] = []

    async def fake_run_scanner_once():
        assert asyncio.get_running_loop() is not current_loop
        called.set()

    async def tracking_to_thread(func, *args, **kwargs):
        to_thread_calls.append(func.__name__)
        return await original_to_thread(func, *args, **kwargs)

    monkeypatch.setattr(main, "run_scanner_once", fake_run_scanner_once)
    monkeypatch.setattr(main.asyncio, "to_thread", tracking_to_thread)

    task = asyncio.create_task(main.auto_scanner_loop())
    await asyncio.wait_for(original_to_thread(called.wait, 1), timeout=2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert "run_coroutine_in_thread" in to_thread_calls


@pytest.mark.asyncio
async def test_auto_management_loop_runs_manager_outside_api_event_loop(monkeypatch):
    current_loop = asyncio.get_running_loop()
    original_to_thread = asyncio.to_thread
    called = threading.Event()
    to_thread_calls: list[str] = []

    async def fake_run_management_once():
        assert asyncio.get_running_loop() is not current_loop
        called.set()

    async def tracking_to_thread(func, *args, **kwargs):
        to_thread_calls.append(func.__name__)
        return await original_to_thread(func, *args, **kwargs)

    monkeypatch.setattr(main, "run_management_once", fake_run_management_once)
    monkeypatch.setattr(main.asyncio, "to_thread", tracking_to_thread)

    task = asyncio.create_task(main.auto_management_loop())
    await asyncio.wait_for(original_to_thread(called.wait, 1), timeout=2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert "run_coroutine_in_thread" in to_thread_calls
