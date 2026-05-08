import hashlib
import json
import math
import os
import random
import sys
import time
from datetime import date, timedelta
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "5"))
supabase = None


STRATEGIES = [
    {
        "id": "aggressive_copy",
        "name": "Aggressive Copy",
        "risk": 1.35,
        "edge": 0.009,
        "trade_factor": 62,
        "color": "#38d49b",
    },
    {
        "id": "conservative_growth",
        "name": "Conservative Growth",
        "risk": 0.72,
        "edge": 0.011,
        "trade_factor": 42,
        "color": "#a77dff",
    },
    {
        "id": "degen_play",
        "name": "Degen Play",
        "risk": 1.85,
        "edge": 0.006,
        "trade_factor": 76,
        "color": "#27f4f2",
    },
    {
        "id": "martingale",
        "name": "Martingale",
        "risk": 2.4,
        "edge": -0.004,
        "trade_factor": 28,
        "color": "#ff6b6b",
    },
]


def run_copy_trading_backtest(name: str, wallets: list[str]) -> dict[str, Any]:
    """Faux simulateur déterministe pour tester tout le flux avant ton vrai backtest."""
    seed = int(hashlib.sha256(f"{name}|{'|'.join(wallets)}".encode("utf-8")).hexdigest()[:16], 16)
    rng = random.Random(seed)
    strategy_results = []
    balance_curves = []

    for strategy in STRATEGIES:
      result, curve = simulate_strategy(strategy, wallets, rng)
      strategy_results.append(result)
      balance_curves.append(curve)

    best = max(strategy_results, key=lambda item: item["pnl_percent"])
    worst = min(strategy_results, key=lambda item: item["pnl_percent"])
    total_trades = sum(item["trades"] for item in strategy_results)
    weighted_win_rate = sum(item["win_rate"] * item["trades"] for item in strategy_results) / total_trades

    return {
        "summary": {
            "total_pnl_percent": round(sum(item["pnl_percent"] for item in strategy_results), 2),
            "total_trades": total_trades,
            "win_rate": round(weighted_win_rate, 2),
            "average_roi": round(sum(item["roi_percent"] for item in strategy_results) / len(strategy_results), 2),
            "best_strategy": best["name"],
            "worst_strategy": worst["name"],
            "max_drawdown": round(max(item["max_drawdown"] for item in strategy_results), 2),
        },
        "strategies": strategy_results,
        "charts": {
            "balance_curves": balance_curves,
            "equity_curve": balance_curves[0]["points"],
        },
        "logs": [
            f"Bundle analysé : {name}",
            f"{len(wallets)} wallets reçus",
            f"{len(strategy_results)} stratégies simulées",
            f"Meilleure stratégie : {best['name']}",
        ],
    }


def simulate_strategy(strategy: dict[str, Any], wallets: list[str], rng: random.Random) -> tuple[dict[str, Any], dict[str, Any]]:
    balance = 1_000.0
    peak = balance
    max_drawdown = 0.0
    wins = 0
    losses = 0
    pnl_samples = []
    points = []
    start = date.today() - timedelta(days=29)

    for day in range(30):
        wallet_signal = math.sin((day + 1) * (len(wallets) + 2) * 0.37)
        noise = rng.gauss(strategy["edge"], 0.018 * strategy["risk"])
        daily_return = strategy["edge"] + wallet_signal * 0.004 + noise
        daily_return = max(min(daily_return, 0.13), -0.16)
        pnl_samples.append(daily_return)
        balance *= 1 + daily_return
        peak = max(peak, balance)
        drawdown = (peak - balance) / peak * 100
        max_drawdown = max(max_drawdown, drawdown)
        if daily_return >= 0:
            wins += 1
        else:
            losses += 1
        points.append({"timestamp": (start + timedelta(days=day)).isoformat(), "value": round(balance, 2)})

    trades = max(int(len(wallets) * strategy["trade_factor"] + rng.randint(8, 44)), 1)
    pnl_percent = (balance - 1_000.0) / 1_000.0 * 100
    win_rate = wins / (wins + losses) * 100

    result = {
        "id": strategy["id"],
        "name": strategy["name"],
        "pnl_percent": round(pnl_percent, 2),
        "pnl_usd": round((balance - 1_000.0) * 165, 2),
        "trades": trades,
        "wins": round(trades * win_rate / 100),
        "losses": trades - round(trades * win_rate / 100),
        "win_rate": round(win_rate, 2),
        "roi_percent": round(pnl_percent, 2),
        "average_trade_percent": round(pnl_percent / trades, 4),
        "max_drawdown": round(max_drawdown, 2),
        "sharpe_ratio": round(mean(pnl_samples) / (stddev(pnl_samples) or 1) * math.sqrt(365), 2),
        "profit_factor": round(sum(x for x in pnl_samples if x > 0) / abs(sum(x for x in pnl_samples if x < 0) or 1), 2),
        "average_hold_time_minutes": round(18 + strategy["risk"] * 21 + rng.randint(0, 18)),
        "tags": ["simulation", "local", strategy["id"]],
    }
    curve = {"strategy": strategy["name"], "color": strategy["color"], "points": points}
    return result, curve


def mean(values: list[float]) -> float:
    return sum(values) / len(values)


def stddev(values: list[float]) -> float:
    avg = mean(values)
    return math.sqrt(sum((value - avg) ** 2 for value in values) / len(values))


def fetch_pending_analysis() -> dict[str, Any] | None:
    client = get_supabase_client()
    response = (
        client.table("analyses")
        .select("*")
        .eq("status", "pending")
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def update_analysis(analysis_id: str, payload: dict[str, Any]) -> None:
    get_supabase_client().table("analyses").update(payload).eq("id", analysis_id).execute()


def get_supabase_client() -> Any:
    global supabase

    if supabase is not None:
        return supabase

    from supabase import create_client

    supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    return supabase


def main() -> None:
    print("Worker copy trading démarré.")

    while True:
        analysis = fetch_pending_analysis()

        if not analysis:
            time.sleep(POLL_SECONDS)
            continue

        analysis_id = analysis["id"]
        print(f"Traitement {analysis_id} - {analysis['name']}")
        update_analysis(analysis_id, {"status": "processing"})

        try:
            result = run_copy_trading_backtest(analysis["name"], analysis["wallets"])
            time.sleep(2)
            update_analysis(analysis_id, {"status": "completed", "result": result})
            print(f"Terminé {analysis_id}")
        except Exception as error:
            update_analysis(
                analysis_id,
                {
                    "status": "error",
                    "result": {
                        "summary": {},
                        "strategies": [],
                        "logs": [f"Erreur worker : {error}"],
                    },
                },
            )
            print(f"Erreur {analysis_id}: {error}")


if __name__ == "__main__":
    if "--demo" in sys.argv:
        demo_result = run_copy_trading_backtest(
            "Whale Alpha List 1",
            [
                "7Y8x2aFakeWallet111111111111111111111111111",
                "H3k9z1FakeWallet222222222222222222222222222",
                "Fp2L5qFakeWallet333333333333333333333333333",
            ],
        )
        print(json.dumps(demo_result, ensure_ascii=False, indent=2))
    else:
        main()
