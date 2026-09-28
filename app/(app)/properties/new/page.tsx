"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { regStepDefs } from "../../../_lib/data";
import { card, fieldLabel, input, checkLabel, btnPrimary, btnSecondary, stripePlaceholder, stepClass } from "../../../_lib/ui";

const LAST_STEP = regStepDefs.length;

export default function NewPropertyPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "中央区上近江 新築戸建",
    type: "新築戸建",
    price: "3,780",
    address: "新潟市中央区上近江1丁目",
    landArea: "180.25",
    buildingArea: "105.98",
    parking: "2",
    access: "最寄り駅 徒歩12分",
    layout: "4LDK",
    age: "2026年6月（新築）",
  });

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const back = () => (step > 1 ? setStep(step - 1) : router.push("/dashboard"));
  const next = () => setStep(Math.min(LAST_STEP, step + 1));
  const finish = () => router.push("/dashboard");

  return (
    <>
      <div className="flex gap-2 mb-5">
        {regStepDefs.map((s) => (
          <div key={s.num} className={stepClass(step === s.num)}>
            {s.num}. {s.label}
          </div>
        ))}
      </div>
      <div className={`${card} p-6`}>
        {step === 1 && (
          <>
            <div className="text-[15px] font-bold text-ink mb-4">基本情報</div>
            <div className="grid gap-3.5">
              <div>
                <label className={fieldLabel}>物件名</label>
                <input value={form.name} onChange={update("name")} className={input} />
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className={fieldLabel}>物件種別</label>
                  <select value={form.type} onChange={update("type")} className={input}>
                    <option>新築戸建</option>
                    <option>中古戸建</option>
                    <option>土地</option>
                  </select>
                </div>
                <div>
                  <label className={fieldLabel}>販売価格（万円）</label>
                  <input value={form.price} onChange={update("price")} className={input} />
                </div>
              </div>
              <div>
                <label className={fieldLabel}>所在地</label>
                <input value={form.address} onChange={update("address")} className={input} />
              </div>
              <div className="grid grid-cols-3 gap-3.5">
                <div>
                  <label className={fieldLabel}>土地面積（㎡）</label>
                  <input value={form.landArea} onChange={update("landArea")} className={input} />
                </div>
                <div>
                  <label className={fieldLabel}>建物面積（㎡）</label>
                  <input value={form.buildingArea} onChange={update("buildingArea")} className={input} />
                </div>
                <div>
                  <label className={fieldLabel}>駐車場台数</label>
                  <input value={form.parking} onChange={update("parking")} className={input} />
                </div>
              </div>
              <div>
                <label className={fieldLabel}>交通</label>
                <input value={form.access} onChange={update("access")} className={input} />
              </div>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="text-[15px] font-bold text-ink mb-4">立地・設備</div>
            <div className="grid gap-3.5">
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className={fieldLabel}>間取り</label>
                  <input value={form.layout} onChange={update("layout")} className={input} />
                </div>
                <div>
                  <label className={fieldLabel}>築年数</label>
                  <input value={form.age} onChange={update("age")} className={input} />
                </div>
              </div>
              <div>
                <label className="text-[13px] text-body mb-1.5 block">主な特徴</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={checkLabel}>
                    <input type="checkbox" defaultChecked />
                    ZEH
                  </label>
                  <label className={checkLabel}>
                    <input type="checkbox" defaultChecked />
                    駐車場2台
                  </label>
                  <label className={checkLabel}>
                    <input type="checkbox" />
                    長期優良住宅
                  </label>
                  <label className={checkLabel}>
                    <input type="checkbox" defaultChecked />
                    小学校徒歩8分
                  </label>
                </div>
              </div>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <div className="text-[15px] font-bold text-ink mb-4">写真・間取り</div>
            <div className="grid grid-cols-3 gap-3">
              <div className={`${stripePlaceholder} aspect-[4/3] rounded-lg text-[11px]`}>外観写真</div>
              <div className={`${stripePlaceholder} aspect-[4/3] rounded-lg text-[11px]`}>内観写真</div>
              <div className={`${stripePlaceholder} aspect-[4/3] rounded-lg text-[11px]`}>間取り図</div>
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <div className="text-[15px] font-bold text-ink mb-4">確認</div>
            <div className="text-[13px] text-body leading-[1.9]">
              物件名：{form.name}
              <br />
              物件種別：{form.type}
              <br />
              販売価格：{form.price}万円
              <br />
              所在地：{form.address}
              <br />
              土地面積：{form.landArea}㎡
              <br />
              建物面積：{form.buildingArea}㎡
              <br />
              駐車場台数：{form.parking}台
              <br />
              交通：{form.access}
              <br />
              間取り：{form.layout}
              <br />
              築年数：{form.age}
            </div>
          </>
        )}
        <div className="flex justify-between mt-6">
          <button onClick={back} className={btnSecondary}>
            戻る
          </button>
          {step !== LAST_STEP ? (
            <button onClick={next} className={btnPrimary}>
              次へ
            </button>
          ) : (
            <button onClick={finish} className={btnPrimary}>
              登録する
            </button>
          )}
        </div>
      </div>
    </>
  );
}
