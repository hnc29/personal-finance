import { ImageSourcePropType } from "react-native";

export const BANK_ICON_IMAGES: Record<string, ImageSourcePropType> = {
  // Top tier Vietnam Banks
  VIETCOMBANK: require("../../assets/bank_icons/vietcombank.png"),
  BIDV: require("../../assets/bank_icons/bidv.png"),
  VIETINBANK: require("../../assets/bank_icons/vietinbank.png"),
  AGRIBANK: require("../../assets/bank_icons/agribank.png"),
  TECHCOMBANK: require("../../assets/bank_icons/techcombank.png"),
  MBBANK: require("../../assets/bank_icons/mbbank.png"),
  VPBANK: require("../../assets/bank_icons/vpbank.png"),
  ACB: require("../../assets/bank_icons/acb.png"),
  SACOMBANK: require("../../assets/bank_icons/sacombank.png"),
  TPBANK: require("../../assets/bank_icons/tpbank.png"),
  HDBANK: require("../../assets/bank_icons/hdbank.png"),
  VIB: require("../../assets/bank_icons/vib.png"),
  SHB: require("../../assets/bank_icons/shb.png"),
  MSB: require("../../assets/bank_icons/msb.png"),
  SEABANK: require("../../assets/bank_icons/seabank.png"),
  OCB: require("../../assets/bank_icons/ocb.png"),
  LPBANK: require("../../assets/bank_icons/lpbank.png"),
  EXIMBANK: require("../../assets/bank_icons/eximbank.png"),
  NAMABANK: require("../../assets/bank_icons/nam_a_bank.png"),
  BACABANK: require("../../assets/bank_icons/bac_a_bank.png"),
  KIENLONGBANK: require("../../assets/bank_icons/kienlongbank.png"),
  BAOVIETBANK: require("../../assets/bank_icons/baovietbank.png"),
  PVCOMBANK: require("../../assets/bank_icons/pvcombank.png"),
  SAIGONBANK: require("../../assets/bank_icons/saigonbank.png"),
  ABBANK: require("../../assets/bank_icons/abbank.png"),
  PGBANK: require("../../assets/bank_icons/pgbank.png"),
  BVBANK: require("../../assets/bank_icons/bvbank.png"),
  OCEANBANK: require("../../assets/bank_icons/oceanbank.png"),
  SCB: require("../../assets/bank_icons/scb.png"),

  // Foreign & Joint Venture Banks
  SHINHAN: require("../../assets/bank_icons/shinhan.png"),
  HSBC: require("../../assets/bank_icons/hsbc.png"),
  STANDARDCHARTERED: require("../../assets/bank_icons/standard_chartered.png"),
  CITIBANK: require("../../assets/bank_icons/citibank.png"),
  VRB: require("../../assets/bank_icons/vrb.png"),

  // E-wallets & Digital Banks / Fintech
  MOMO: require("../../assets/bank_icons/momo.png"),
  ZALOPAY: require("../../assets/bank_icons/zalopay.png"),
  VIETTELMONEY: require("../../assets/bank_icons/viettelmoney.png"),
  SHOPEEPAY: require("../../assets/bank_icons/shopeepay.png"),
  VNPAY: require("../../assets/bank_icons/vnpay.png"),
  VNPTMONEY: require("../../assets/bank_icons/vnptmoney.png"),
  CAKE: require("../../assets/bank_icons/cake.png"),
  LIOBANK: require("../../assets/bank_icons/liobank.png"),
  PAYOO: require("../../assets/bank_icons/payoo.png"),
  GRABPAY: require("../../assets/bank_icons/grabpay.png"),
  TRUEMONEY: require("../../assets/bank_icons/truemoney.png"),
  TIKI: require("../../assets/bank_icons/tiki.png"),
  ONEPAY: require("../../assets/bank_icons/onepay.png"),
  NEXTPAY: require("../../assets/bank_icons/nextpay.png"),
  PAYPAL: require("../../assets/bank_icons/paypal.png"),
  TIMO: require("../../assets/bank_icons/timo.png"),
  CREDIT_CARD: require("../../assets/bank_icons/credit_card.png"),
};

export function getBankIconImage(key: string): ImageSourcePropType | null {
  return BANK_ICON_IMAGES[key.toUpperCase()] || null;
}
