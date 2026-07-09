import asyncio

import pytest

import app.main as main
import app.paper.realtime_execution as realtime_execution


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
async def test_auto_scanner_loop_keeps_async_scanner_on_worker_event_loop(monkeypatch):
    current_loop = asyncio.get_running_loop()
    called = asyncio.Event()
    to_thread_calls: list[str] = []

    async def fake_run_scanner_once():
        assert asyncio.get_running_loop() is current_loop
        called.set()

    async def tracking_to_thread(func, *args, **kwargs):
        to_thread_calls.append(func.__name__)
        return func(*args, **kwargs)

    monkeypatch.setattr(main, "run_scanner_once", fake_run_scanner_once)
    monkeypatch.setattr(main.asyncio, "to_thread", tracking_to_thread)

    task = asyncio.create_task(main.auto_scanner_loop())
    await asyncio.wait_for(called.wait(), timeout=2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert to_thread_calls == []


@pytest.mark.asyncio
async def test_auto_management_loop_keeps_async_manager_on_worker_event_loop(monkeypatch):
    current_loop = asyncio.get_running_loop()
    called = asyncio.Event()
    to_thread_calls: list[str] = []

    async def fake_run_management_once():
        assert asyncio.get_running_loop() is current_loop
        called.set()

    async def tracking_to_thread(func, *args, **kwargs):
        to_thread_calls.append(func.__name__)
        return func(*args, **kwargs)

    monkeypatch.setattr(main, "run_management_once", fake_run_management_once)
    monkeypatch.setattr(main.asyncio, "to_thread", tracking_to_thread)

    task = asyncio.create_task(main.auto_management_loop())
    await asyncio.wait_for(called.wait(), timeout=2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert to_thread_calls == []


@pytest.mark.asyncio
async def test_auto_realtime_loop_keeps_execution_on_worker_event_loop(monkeypatch):
    current_loop = asyncio.get_running_loop()
    called = asyncio.Event()

    async def fake_run_realtime_execution_once(**kwargs):
        assert asyncio.get_running_loop() is current_loop
        called.set()
        return {"status": "ok"}

    monkeypatch.setattr(realtime_execution, "run_realtime_execution_once", fake_run_realtime_execution_once)

    task = asyncio.create_task(realtime_execution.auto_realtime_execution_loop())
    await asyncio.wait_for(called.wait(), timeout=2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


def test_sentiment_scheduler_catches_up_when_generation_crosses_hour_boundary():
    delay = main.next_aligned_scheduler_delay(
        cycle_started_epoch=3_590,
        cycle_finished_epoch=3_640,
        interval_seconds=3_600,
        offset_seconds=30,
    )

    assert delay == 5.0
