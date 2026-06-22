import asyncio

from app.core.config import get_settings
from app.db import init_db
from app.main import (
    auto_management_loop,
    auto_realtime_execution_loop,
    auto_scanner_loop,
    binance_client,
    cleanup_stale_running_runs,
    handle_realtime_paper_execution_result,
    warm_initial_league_cache,
)
from app.market.data_cache import warm_market_cache


async def main() -> None:
    settings = get_settings()
    init_db()
    cleanup_stale_running_runs()
    warm_initial_league_cache()
    await warm_market_cache(binance_client())
    should_run_realtime = (
        settings.enable_realtime_paper_execution and settings.realtime_paper_execution_role in {"worker", "both"}
    )
    if not settings.enable_auto_scanner and not should_run_realtime:
        while True:
            await asyncio.sleep(3600)
    scanner_task = asyncio.create_task(auto_scanner_loop()) if settings.enable_auto_scanner else None
    management_task = asyncio.create_task(auto_management_loop()) if settings.enable_auto_scanner else None
    realtime_task = asyncio.create_task(auto_realtime_execution_loop(on_result=handle_realtime_paper_execution_result)) if should_run_realtime else None
    try:
        tasks = [task for task in (scanner_task, management_task, realtime_task) if task is not None]
        await asyncio.gather(*tasks)
    finally:
        tasks = [task for task in (scanner_task, management_task, realtime_task) if task is not None]
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
