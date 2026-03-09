"""
Burnout Risk Scorer

Scores user burnout risk on a 0-100 scale using a GradientBoostingClassifier
trained on synthetic workload profiles. More nuanced than threshold-based
rule detection — outputs a continuous score plus level, trend, and
contributing factors.
"""

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from typing import List, Dict, Optional


class BurnoutScorer:
    """
    ML-based burnout risk scorer.
    Input:  list of weekly workload dicts (last 4 weeks preferred)
    Output: score 0-100, level, trend, contributing factors
    """

    MODEL_VERSION = "gbm-burnout-v1.0"
    LEVELS        = ["none", "low", "medium", "high", "critical"]

    # Midpoint scores per class for weighted continuous score
    CLASS_MIDPOINTS = np.array([5, 25, 50, 75, 95], dtype=float)

    def __init__(self):
        self.model = GradientBoostingClassifier(
            n_estimators=150,
            max_depth=4,
            learning_rate=0.10,
            subsample=0.85,
            random_state=42,
        )
        self.scaler = StandardScaler()
        self._train()

    # ── Feature extraction ─────────────────────────────────────────────────────

    def _extract_features(self, metrics: List[Dict]) -> np.ndarray:
        """Compute 10 scalar features from a list of weekly metric dicts."""
        work_m = [float(w.get("work_minutes",     0)) for w in metrics]
        ot_m   = [float(w.get("overtime_minutes", 0)) for w in metrics]
        mt_m   = [float(w.get("meeting_minutes",  0)) for w in metrics]
        fc_m   = [float(w.get("focus_minutes",    0)) for w in metrics]
        mt_cnt = [float(w.get("meeting_count",    0)) for w in metrics]

        avg_work_h = float(np.mean(work_m)) / 60.0
        avg_ot_h   = float(np.mean(ot_m))   / 60.0

        ot_ratio = float(np.mean(
            [o / w if w > 0 else 0.0 for o, w in zip(ot_m, work_m)]
        ))
        mt_ratio = float(np.mean(
            [m / w if w > 0 else 0.0 for m, w in zip(mt_m, work_m)]
        ))
        fc_ratio = float(np.mean(
            [f / w if w > 0 else 0.0 for f, w in zip(fc_m, work_m)]
        ))

        hi_weeks  = float(sum(1 for w in work_m if w > 50 * 60))
        consec_hi = min(5.0, hi_weeks * 1.2)

        # Positive slope = worsening
        if len(work_m) >= 2:
            raw_trend = (work_m[-1] - work_m[0]) / (len(work_m) * 60.0 * 8)
        else:
            raw_trend = 0.0
        trend = float(np.clip(raw_trend, -1.0, 1.0))

        avg_daily_mt = float(np.mean(mt_cnt)) / 5.0
        variability  = float(np.std(work_m) / 60.0) if len(work_m) > 1 else 0.0

        return np.array([
            avg_work_h,
            avg_ot_h,
            ot_ratio,
            mt_ratio,
            fc_ratio,
            consec_hi,
            trend,
            hi_weeks,
            avg_daily_mt,
            variability,
        ])

    # ── Synthetic training data ────────────────────────────────────────────────

    def _generate_synthetic(self, n: int = 3000) -> tuple:
        """
        Each sample represents 4 weeks of aggregated metrics.
        Profiles span none (0) → critical (4) burnout with realistic noise.
        Columns: avg_work_h, avg_ot_h, ot_ratio, mt_ratio, fc_ratio,
                 consec_hi, trend, hi_weeks, daily_mt, variability
        """
        rng = np.random.default_rng(123)

        profiles = [
            # label 0 = none
            (36.0,  0.0, 0.00, 0.25, 0.40, 0.0,  0.00, 0.0, 1.5,  2.0),
            (38.0,  0.5, 0.01, 0.30, 0.35, 0.2, -0.05, 0.1, 2.0,  3.0),
            # label 1 = low
            (42.0,  2.0, 0.05, 0.38, 0.25, 0.8,  0.05, 0.5, 2.5,  4.0),
            (44.0,  3.0, 0.07, 0.42, 0.20, 1.0,  0.08, 0.8, 3.0,  5.0),
            # label 2 = medium
            (48.0,  6.0, 0.13, 0.50, 0.14, 1.8,  0.15, 1.5, 3.5,  7.0),
            (51.0,  8.0, 0.16, 0.54, 0.10, 2.2,  0.18, 2.0, 4.0,  8.0),
            # label 3 = high
            (55.0, 12.0, 0.22, 0.60, 0.07, 3.2,  0.28, 3.0, 4.5, 10.0),
            (58.0, 15.0, 0.26, 0.64, 0.04, 3.8,  0.32, 3.5, 5.0, 12.0),
            # label 4 = critical
            (64.0, 22.0, 0.34, 0.70, 0.01, 4.6,  0.48, 4.0, 5.5, 15.0),
            (70.0, 28.0, 0.40, 0.74, 0.00, 5.0,  0.58, 4.5, 6.0, 18.0),
        ]
        labels = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]
        per    = n // len(profiles)

        X, y = [], []
        for prof, label in zip(profiles, labels):
            wh, oth, otr, mtr, fcr, chi, trnd, hiw, dmt, var = prof
            for _ in range(per):
                row = [
                    max(20.0, wh  + rng.normal(0, 3.0)),
                    max(0.0,  oth + rng.normal(0, 1.5)),
                    float(np.clip(otr  + rng.normal(0, 0.03), 0, 0.80)),
                    float(np.clip(mtr  + rng.normal(0, 0.05), 0, 0.90)),
                    float(np.clip(fcr  + rng.normal(0, 0.04), 0, 0.50)),
                    float(np.clip(chi  + rng.normal(0, 0.40), 0, 5.0)),
                    float(np.clip(trnd + rng.normal(0, 0.08), -1.0, 1.0)),
                    float(np.clip(hiw  + rng.normal(0, 0.30), 0, 4.0)),
                    max(0.0, dmt + rng.normal(0, 0.5)),
                    max(0.0, var + rng.normal(0, 2.0)),
                ]
                X.append(row)
                y.append(label)

        return np.array(X), np.array(y)

    def _train(self) -> None:
        X, y = self._generate_synthetic()
        self.scaler.fit(X)
        self.model.fit(self.scaler.transform(X), y)

    # ── Public API ─────────────────────────────────────────────────────────────

    def score(self, weekly_metrics: List[Dict]) -> Dict:
        """
        Score burnout risk from 1-4 weeks of weekly workload data.

        Parameters
        ----------
        weekly_metrics : list of dicts
            Keys: work_minutes, overtime_minutes, meeting_minutes,
                  focus_minutes, meeting_count, week_start_date (optional)

        Returns
        -------
        dict with: score (0-100), level, trend, contributing_factors,
                   confidence, probabilities, metrics_summary, model_version
        """
        if not weekly_metrics:
            return self._default()

        sorted_w = sorted(
            weekly_metrics,
            key=lambda w: w.get("week_start_date", ""),
        )
        recent = sorted_w[-4:]

        feats   = self._extract_features(recent).reshape(1, -1)
        feats_s = self.scaler.transform(feats)
        proba   = self.model.predict_proba(feats_s)[0]
        pred_cl = int(self.model.predict(feats_s)[0])

        # Weighted continuous score 0–100
        score = float(np.clip(np.dot(proba, self.CLASS_MIDPOINTS), 0, 100))

        # Trend
        work_m = [float(w.get("work_minutes", 0)) for w in recent]
        slope  = (
            (work_m[-1] - work_m[0]) / (len(work_m) * 60.0)
            if len(work_m) >= 2 else 0.0
        )
        trend = (
            "worsening" if slope >  5 else
            "improving" if slope < -5 else
            "stable"
        )

        # Summary metrics
        avg_wt  = float(np.mean(work_m))
        avg_ot  = float(np.mean([float(w.get("overtime_minutes", 0)) for w in recent]))
        avg_mt  = float(np.mean([float(w.get("meeting_minutes",  0)) for w in recent]))
        avg_fc  = float(np.mean([float(w.get("focus_minutes",    0)) for w in recent]))
        hi_wks  = sum(1 for w in work_m if w > 50 * 60)

        return {
            "score":               round(score, 1),
            "level":               self.LEVELS[pred_cl],
            "trend":               trend,
            "contributing_factors": self._factors(
                avg_wt / 60, avg_ot / 60,
                avg_mt / avg_wt if avg_wt > 0 else 0,
                avg_fc / avg_wt if avg_wt > 0 else 0,
                hi_wks, slope,
            ),
            "confidence":          round(float(max(proba)), 2),
            "probabilities": {
                lv: round(float(p), 3)
                for lv, p in zip(self.LEVELS, proba)
            },
            "metrics_summary": {
                "avg_weekly_hours":   round(avg_wt / 60, 1),
                "avg_overtime_hours": round(avg_ot / 60, 1),
                "meeting_ratio":      round(avg_mt / avg_wt, 2) if avg_wt > 0 else 0,
                "focus_ratio":        round(avg_fc / avg_wt, 2) if avg_wt > 0 else 0,
                "high_load_weeks":    hi_wks,
                "weeks_analysed":     len(recent),
            },
            "model_version": self.MODEL_VERSION,
        }

    def _factors(
        self,
        avg_work_h: float,
        avg_ot_h:   float,
        mt_ratio:   float,
        fc_ratio:   float,
        hi_wks:     int,
        slope:      float,
    ) -> List[str]:
        factors: List[str] = []

        if avg_work_h > 55:
            factors.append(f"Extremely high weekly workload ({avg_work_h:.0f}h avg)")
        elif avg_work_h > 48:
            factors.append(f"Above-normal weekly workload ({avg_work_h:.0f}h avg)")

        if avg_ot_h > 12:
            factors.append(f"Heavy overtime ({avg_ot_h:.0f}h/week avg)")
        elif avg_ot_h > 4:
            factors.append(f"Regular overtime ({avg_ot_h:.0f}h/week avg)")

        if mt_ratio > 0.60:
            factors.append(f"Very high meeting load ({mt_ratio*100:.0f}% of work time)")
        elif mt_ratio > 0.45:
            factors.append(f"High meeting density ({mt_ratio*100:.0f}% of work time)")

        if fc_ratio < 0.05:
            factors.append("No dedicated focus time")
        elif fc_ratio < 0.15:
            factors.append(f"Very low focus time ({fc_ratio*100:.0f}% of work time)")

        if hi_wks >= 4:
            factors.append("All 4 recent weeks exceeded 50h")
        elif hi_wks >= 3:
            factors.append(f"{hi_wks} of last 4 weeks exceeded 50h")

        if slope > 8:
            factors.append("Workload is consistently increasing week-over-week")

        return factors if factors else ["Workload appears within healthy ranges"]

    def _default(self) -> Dict:
        return {
            "score":               0.0,
            "level":               "none",
            "trend":               "stable",
            "contributing_factors": ["Insufficient data to assess burnout risk"],
            "confidence":          0.0,
            "probabilities":       {lv: 0.0 for lv in self.LEVELS},
            "metrics_summary":     {},
            "model_version":       self.MODEL_VERSION,
        }


# ── Singleton ──────────────────────────────────────────────────────────────────

_scorer: Optional[BurnoutScorer] = None


def get_burnout_scorer() -> BurnoutScorer:
    global _scorer
    if _scorer is None:
        _scorer = BurnoutScorer()
    return _scorer
