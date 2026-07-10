import asyncio
import logging
import threading
import time

from app.core.config import get_settings
from app.db import init_db
from app.main import (
    auto_league_sentiment_loop,
    auto_management_loop,
    auto_realtime_execution_loop,
    auto_scanner_loop,
    binance_client,
    cleanup_stale_running_runs,
    handle_realtime_paper_execution_result,
    warm_initial_league_cache,
)
from app.market.data_cache import warm_market_cache
from app.worker_watchdog import maintain_worker_heartbeat, monitor_worker_heartbeat


async def idle_worker_loop() -> None:
    while True:
        await asyncio.sleep(3600)


async def main() -> None:
    settings = get_settings()
    init_db()
    cleanup_stale_running_runs()
    warm_initial_league_cache()
    await warm_market_cache(binance_client())
    should_run_realtime = (
        settings.enable_realtime_paper_execution and settings.realtime_paper_execution_role in {"worker", "both"}
    )
    should_run_sentiment = settings.enable_league_sentiment_scheduler
    scanner_task = asyncio.create_task(auto_scanner_loop()) if settings.enable_auto_scanner else None
    management_task = asyncio.create_task(auto_management_loop()) if settings.enable_auto_scanner else None
    realtime_task = asyncio.create_task(auto_realtime_execution_loop(on_result=handle_realtime_paper_execution_result)) if should_run_realtime else None
    sentiment_task = asyncio.create_task(auto_league_sentiment_loop()) if should_run_sentiment else None
    tasks = [task for task in (scanner_task, management_task, realtime_task, sentiment_task) if task is not None]
    if not tasks:
        tasks.append(asyncio.create_task(idle_worker_loop()))

    watchdog_stop = threading.Event()
    watchdog_thread: threading.Thread | None = None
    heartbeat_task: asyncio.Task | None = None
    if settings.enable_worker_watchdog:
        heartbeat = {"last_seen": time.monotonic()}
        heartbeat_task = asyncio.create_task(maintain_worker_heartbeat(heartbeat))
        tasks.append(heartbeat_task)
        watchdog_thread = threading.Thread(
            target=monitor_worker_heartbeat,
            kwargs={
                "heartbeat": heartbeat,
                "stop_event": watchdog_stop,
                "timeout_seconds": max(30, settings.worker_watchdog_timeout_seconds),
            },
            name="worker-event-loop-watchdog",
            daemon=True,
        )
        watchdog_thread.start()
    try:
        await asyncio.gather(*tasks)
    finally:
        watchdog_stop.set()
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if watchdog_thread is not None:
            watchdog_thread.join(timeout=1.0)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    asyncio.run(main())
