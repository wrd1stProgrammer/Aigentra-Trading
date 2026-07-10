import asyncio
from collections.abc import Callable, MutableMapping
import logging
import os
import threading
import time


logger = logging.getLogger(__name__)


def worker_watchdog_expired(*, last_heartbeat: float, now: float, timeout_seconds: float) -> bool:
    return now - last_heartbeat > max(1.0, timeout_seconds)


async def maintain_worker_heartbeat(
    heartbeat: MutableMapping[str, float],
    *,
    interval_seconds: float = 2.0,
) -> None:
    while True:
        heartbeat["last_seen"] = time.monotonic()
        await asyncio.sleep(interval_seconds)


def monitor_worker_heartbeat(
    heartbeat: MutableMapping[str, float],
    stop_event: threading.Event,
    *,
    timeout_seconds: float,
    check_interval_seconds: float = 5.0,
    monotonic: Callable[[], float] = time.monotonic,
    exit_process: Callable[[int], None] = os._exit,
) -> None:
    while not stop_event.wait(max(0.01, check_interval_seconds)):
        last_heartbeat = heartbeat.get("last_seen", monotonic())
        now = monotonic()
        if not worker_watchdog_expired(
            last_heartbeat=last_heartbeat,
            now=now,
            timeout_seconds=timeout_seconds,
        ):
            continue
        logger.critical(
            "worker_event_loop_stalled heartbeat_age_seconds=%.1f timeout_seconds=%.1f",
            now - last_heartbeat,
            timeout_seconds,
        )
        stop_event.set()
        logging.shutdown()
        exit_process(1)
        return
