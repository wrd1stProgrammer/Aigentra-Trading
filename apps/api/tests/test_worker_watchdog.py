import threading

from app.worker_watchdog import monitor_worker_heartbeat, worker_watchdog_expired


def test_worker_watchdog_expiry_uses_heartbeat_age():
    assert worker_watchdog_expired(last_heartbeat=10.0, now=129.9, timeout_seconds=120) is False
    assert worker_watchdog_expired(last_heartbeat=10.0, now=130.1, timeout_seconds=120) is True


def test_worker_watchdog_exits_stalled_process():
    stop_event = threading.Event()
    exit_codes: list[int] = []

    monitor_worker_heartbeat(
        {"last_seen": 10.0},
        stop_event,
        timeout_seconds=120,
        check_interval_seconds=0.01,
        monotonic=lambda: 131.0,
        exit_process=exit_codes.append,
    )

    assert stop_event.is_set()
    assert exit_codes == [1]
