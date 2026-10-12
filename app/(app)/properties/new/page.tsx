import PropertySteps from "../../../_components/PropertySteps";
import PropertyForm from "../PropertyForm";

// 物件の登録（設計書 7章、D15）。保存すると住所から位置を取り、物件の画面で地図のピンを確かめる

export default function NewPropertyPage() {
  return (
    <>
      <PropertySteps current="register" />
      <PropertyForm />
    </>
  );
}
