import asyncio

from app.core.config import get_settings
from app.db import init_db
from app.main import (
    auto_management_loop,
    auto_scanner_loop,
    binance_client,
    cleanup_stale_running_runs,
    warm_initial_league_cache,
)
from app.market.data_cache import warm_market_cache


async def main() -> None:
    settings = get_settings()
    init_db()
    cleanup_stale_running_runs()
    warm_initial_league_cache()
    await warm_market_cache(binance_client())
    if not settings.enable_auto_scanner:
        while True:
            await asyncio.sleep(3600)
    scanner_task = asyncio.create_task(auto_scanner_loop())
    management_task = asyncio.create_task(auto_management_loop())
    try:
        await asyncio.gather(scanner_task, management_task)
    finally:
        for task in (scanner_task, management_task):
            if not task.done():
                task.cancel()
        await asyncio.gather(scanner_task, management_task, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
