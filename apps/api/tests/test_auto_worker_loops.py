import asyncio

import pytest

import app.main as main


@pytest.mark.asyncio
async def test_auto_scanner_loop_awaits_scanner_in_current_event_loop(monkeypatch):
    current_loop = asyncio.get_running_loop()
    called = asyncio.Event()

    async def fake_run_scanner_once():
        assert asyncio.get_running_loop() is current_loop
        called.set()

    async def forbidden_to_thread(*args, **kwargs):
        raise AssertionError("scanner loop must not create a thread-local event loop")

    monkeypatch.setattr(main, "run_scanner_once", fake_run_scanner_once)
    monkeypatch.setattr(main.asyncio, "to_thread", forbidden_to_thread)

    task = asyncio.create_task(main.auto_scanner_loop())
    await asyncio.wait_for(called.wait(), timeout=1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


@pytest.mark.asyncio
async def test_auto_management_loop_awaits_manager_in_current_event_loop(monkeypatch):
    current_loop = asyncio.get_running_loop()
    called = asyncio.Event()

    async def fake_run_management_once():
        assert asyncio.get_running_loop() is current_loop
        called.set()

    async def forbidden_to_thread(*args, **kwargs):
        raise AssertionError("management loop must not create a thread-local event loop")

    monkeypatch.setattr(main, "run_management_once", fake_run_management_once)
    monkeypatch.setattr(main.asyncio, "to_thread", forbidden_to_thread)

    task = asyncio.create_task(main.auto_management_loop())
    await asyncio.wait_for(called.wait(), timeout=1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
