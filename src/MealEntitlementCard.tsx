import React from 'react';
import { CheckCircle2, Clock, CreditCard, MapPin } from 'lucide-react';
import { isMealSessionDateTodayManila } from './entranceCheckInDay';
import { formatMealTimeRangeForDisplay } from './mealClaimWindow';
import {
  mealFoodLocationDetailsShowNoteBox,
  mealLocationLineForCard,
  resolveMealClaimFooter,
  type MealClaimUiMeal,
} from './mealClaimUi';

type Props = {
  meal: MealClaimUiMeal;
  mealLabels: Record<string, string>;
  boothRegs: { uid?: string; fullName?: string; boothLocationDetails?: string }[];
  now: Date;
  claimed: boolean;
  onClaim: () => void;
  /** e.g. `p-4` or `p-5` */
  paddingClass?: string;
};

export function MealEntitlementCard({
  meal,
  mealLabels,
  boothRegs,
  now,
  claimed,
  onClaim,
  paddingClass = 'p-4',
}: Props) {
  const isToday = isMealSessionDateTodayManila(meal.sessionDate);
  const footer = resolveMealClaimFooter(meal, now, claimed);
  const locationBelowTime = mealLocationLineForCard(meal, boothRegs);
  const showFoodNoteBox = mealFoodLocationDetailsShowNoteBox(meal, locationBelowTime);
  const title = meal.name || mealLabels[meal.type] || meal.type;

  return (
    <div
      className={`rounded-2xl border shadow-sm ${paddingClass} ${
        claimed ? 'bg-emerald-50 border-emerald-200' : isToday ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'
      }`}
    >
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="font-bold">{title}</p>
          {meal.itemType ? (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                meal.itemType === 'kit'
                  ? 'bg-violet-100 text-violet-700'
                  : meal.itemType === 'both'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-amber-100 text-amber-700'
              }`}
            >
              {meal.itemType === 'kit' ? 'Kit' : meal.itemType === 'both' ? 'Food & Kit' : 'Food'}
            </span>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {meal.sessionDate ? new Date(meal.sessionDate).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }) : '—'}
      </p>
      {meal.startTime && meal.endTime ? (
        <p className="text-xs font-semibold text-blue-600 mt-0.5 flex items-center gap-1">
          <Clock size={11} /> {formatMealTimeRangeForDisplay(meal.startTime, meal.endTime)}
        </p>
      ) : null}
      {locationBelowTime ? (
        <p className="text-xs text-slate-800 mt-1 flex items-start gap-1.5 font-medium">
          <MapPin size={12} className="shrink-0 text-rose-600 mt-0.5" aria-hidden />
          <span className="min-w-0 leading-snug">{locationBelowTime}</span>
        </p>
      ) : null}
      {showFoodNoteBox && meal.foodLocationDetails ? (
        <div className="mt-2 rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2.5 text-sm text-slate-900 leading-snug">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900/90 mb-1">Note for this pickup</p>
          <p className="whitespace-pre-wrap font-medium text-slate-900">{meal.foodLocationDetails}</p>
        </div>
      ) : null}
      <div className="mt-3">
        {footer.kind === 'claimed' ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-100/80 px-3 py-2.5 text-sm font-black text-emerald-800">
            <CheckCircle2 size={18} className="shrink-0" /> Claimed
          </div>
        ) : null}
        {footer.kind === 'ready' ? (
          <button
            type="button"
            onClick={onClaim}
            className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-sm"
            aria-label="Show digital ID to claim at the booth"
          >
            <CreditCard size={16} /> Claim
          </button>
        ) : null}
        {footer.kind === 'did_not_claim' ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
            <p className="text-sm font-black uppercase tracking-wide text-slate-700">Did not claim</p>
            {footer.hint ? <p className="text-[10px] text-slate-500 mt-1 leading-snug">{footer.hint}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type { MealClaimUiMeal };
