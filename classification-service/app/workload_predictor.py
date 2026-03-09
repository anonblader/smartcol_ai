"""
Workload Prediction Model

Predicts daily work minutes for the next 5 working days based on
historical workload data. Uses a RandomForestRegressor trained on
synthetic workload patterns.
"""

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from typing import List, Dict, Optional
from datetime import datetime, timedelta


class WorkloadPredictor:
    """
    Predicts future daily workload (in minutes) from historical data.
    Model: RandomForestRegressor trained on synthetic workload profiles.
    """

    MODEL_VERSION = "rf-workload-v1.0"

    # Day-of-week load multipliers (0=Mon … 4=Fri)
    DOW_EFFECT = {0: 1.08, 1: 1.02, 2: 1.00, 3: 0.97, 4: 0.90}

    def __init__(self):
        self.model = RandomForestRegressor(
            n_estimators=100,
            max_depth=8,
            min_samples_leaf=5,
            random_state=42,
            n_jobs=-1,
        )
        self.scaler = StandardScaler()
        self._train()

    # ── Feature construction ───────────────────────────────────────────────────

    def _make_features(
        self,
        day_of_week: int,
        week_of_year: int,
        prev_1w: float,
        prev_2w: float,
        recent_avg: float,
        overall_avg: float,
        meeting_ratio: float,
        focus_ratio: float,
        avg_deadline: float,
        overtime_last_week: float,
    ) -> List[float]:
        return [
            day_of_week,
            week_of_year,
            prev_1w,
            prev_2w,
            recent_avg,
            overall_avg,
            meeting_ratio,
            focus_ratio,
            avg_deadline,
            overtime_last_week,
        ]

    # ── Synthetic training data ────────────────────────────────────────────────

    def _generate_synthetic(self, n: int = 2500) -> tuple:
        """
        Generate realistic training data covering 5 workload profiles.
        Each sample = one day's features → target work_minutes.
        """
        rng = np.random.default_rng(42)
        profiles = [
            # (base_min, std, overtime_prob)
            (280, 60,  0.03),   # light
            (400, 70,  0.08),   # moderate
            (480, 90,  0.15),   # normal
            (600, 110, 0.35),   # heavy
            (720, 120, 0.60),   # overloaded
        ]
        X, y = [], []
        per = n // len(profiles)

        for base, std, ot_prob in profiles:
            for _ in range(per):
                dow = int(rng.integers(0, 5))
                woy = int(rng.integers(1, 53))
                effect = self.DOW_EFFECT.get(dow, 1.0)

                def sample_day() -> float:
                    return float(max(0.0, rng.normal(base * effect, std)))

                p1w = sample_day()
                p2w = sample_day()
                recent = (p1w + p2w) / 2.0
                overall = float(max(0.0, rng.normal(base, std)))
                mt_ratio = float(np.clip(rng.normal(0.35, 0.10), 0, 0.80))
                fc_ratio = float(np.clip(rng.normal(0.25, 0.08), 0, 1 - mt_ratio))
                avg_dl   = float(np.clip(rng.normal(0.5,  0.40), 0, 3.0))
                ot_last  = float(max(0.0, rng.normal(base * ot_prob * 5, 30)))

                trend  = (p1w - p2w) * 0.2
                target = float(max(0.0, p1w + trend + rng.normal(0, 40)))

                X.append(self._make_features(
                    dow, woy, p1w, p2w, recent, overall,
                    mt_ratio, fc_ratio, avg_dl, ot_last,
                ))
                y.append(target)

        return np.array(X), np.array(y)

    def _train(self) -> None:
        X, y = self._generate_synthetic()
        self.scaler.fit(X)
        self.model.fit(self.scaler.transform(X), y)

    # ── Public API ─────────────────────────────────────────────────────────────

    def predict_next_week(self, historical_daily: List[Dict]) -> List[Dict]:
        """
        Predict work minutes for the next 5 working days.

        Parameters
        ----------
        historical_daily : list of dicts
            Each dict must have at least: date (YYYY-MM-DD), work_minutes.
            Optional: meeting_minutes, focus_minutes, deadline_count.

        Returns
        -------
        list of dicts, one per predicted working day:
            date, day_of_week, predicted_minutes, predicted_hours,
            confidence, load_level, trend
        """
        if not historical_daily:
            return self._fallback_predictions(None)

        sorted_h = sorted(historical_daily, key=lambda d: d["date"])
        recent   = sorted_h[-20:]   # up to last 20 working days

        work_m = [float(d.get("work_minutes",    0)) for d in recent]
        mt_m   = [float(d.get("meeting_minutes", 0)) for d in recent]
        fc_m   = [float(d.get("focus_minutes",   0)) for d in recent]
        dl_cnt = [float(d.get("deadline_count",  0)) for d in recent]

        def safe_ratio(a: list, b: list) -> float:
            return float(np.mean([x / w if w > 0 else 0.0 for x, w in zip(a, b)]))

        overall_avg  = float(np.mean(work_m))
        recent5_avg  = float(np.mean(work_m[-5:])) if len(work_m) >= 5 else overall_avg
        mt_ratio     = safe_ratio(mt_m, work_m)
        fc_ratio     = safe_ratio(fc_m, work_m)
        avg_dl       = float(np.mean(dl_cnt))
        ot_last      = float(np.mean([max(0.0, w - 480) for w in work_m[-5:]]))

        # Trend direction
        trend_slope = (
            float(work_m[-1] - work_m[0]) / max(1, len(work_m))
            if len(work_m) >= 2 else 0.0
        )
        trend_label = (
            "increasing" if trend_slope > 20
            else "decreasing" if trend_slope < -20
            else "stable"
        )

        last_date   = datetime.strptime(sorted_h[-1]["date"], "%Y-%m-%d")
        predictions = []

        for offset in range(1, 8):
            pred_dt = last_date + timedelta(days=offset)
            if pred_dt.weekday() >= 5:   # skip weekends
                continue

            dow = pred_dt.weekday()
            woy = int(pred_dt.strftime("%V"))
            p1w = work_m[-1]  if work_m           else overall_avg
            p2w = work_m[-6]  if len(work_m) >= 6 else overall_avg

            feats = np.array(self._make_features(
                dow, woy, p1w, p2w, recent5_avg, overall_avg,
                mt_ratio, fc_ratio, avg_dl, ot_last,
            )).reshape(1, -1)

            pred = float(self.model.predict(self.scaler.transform(feats))[0])
            pred = max(0.0, pred)

            n_days     = len(recent)
            confidence = float(np.clip(
                0.45 + n_days * 0.025 - len(predictions) * 0.04,
                0.30, 0.92
            ))

            load_level = (
                "light"    if pred < 360 else
                "moderate" if pred < 540 else
                "high"     if pred < 660 else
                "critical"
            )

            predictions.append({
                "date":              pred_dt.strftime("%Y-%m-%d"),
                "day_of_week":       dow,
                "predicted_minutes": round(pred),
                "predicted_hours":   round(pred / 60, 1),
                "confidence":        round(confidence, 2),
                "load_level":        load_level,
                "trend":             trend_label,
            })

            if len(predictions) >= 5:
                break

        return predictions if predictions else self._fallback_predictions(last_date)

    def _fallback_predictions(self, from_date: Optional[datetime]) -> List[Dict]:
        base   = from_date or datetime.now()
        result = []
        d = base
        for _ in range(7):
            d += timedelta(days=1)
            if d.weekday() >= 5:
                continue
            result.append({
                "date":              d.strftime("%Y-%m-%d"),
                "day_of_week":       d.weekday(),
                "predicted_minutes": 480,
                "predicted_hours":   8.0,
                "confidence":        0.30,
                "load_level":        "moderate",
                "trend":             "stable",
            })
            if len(result) >= 5:
                break
        return result


# ── Singleton ──────────────────────────────────────────────────────────────────

_predictor: Optional[WorkloadPredictor] = None


def get_workload_predictor() -> WorkloadPredictor:
    global _predictor
    if _predictor is None:
        _predictor = WorkloadPredictor()
    return _predictor
