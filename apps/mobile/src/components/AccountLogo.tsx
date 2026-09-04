import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AccountType } from "../types";
import { getAccountBrand } from "../utils/bankLogos";
import { getBankIconImage } from "../utils/bankIconImages";

interface AccountLogoProps {
  name: string;
  accountType: AccountType;
  size?: number;
}

export const AccountLogo: React.FC<AccountLogoProps> = ({
  name,
  accountType,
  size = 42,
}) => {
  const brand = getAccountBrand(name, accountType);
  const imageSource = brand.key ? getBankIconImage(brand.key) : null;

  if (imageSource) {
    return (
      <View
        style={[
          styles.imageContainer,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <Image
          source={imageSource}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
          resizeMode="cover"
        />
      </View>
    );
  }

  const getFallbackIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (accountType) {
      case "CASH":
        return "cash-outline";
      case "CREDIT_CARD":
        return "card-outline";
      case "EWALLET":
        return "phone-portrait-outline";
      case "BANK":
      default:
        return "business-outline";
    }
  };

  const isBankOrWallet =
    (accountType === "BANK" || accountType === "EWALLET" || accountType === "CREDIT_CARD") &&
    brand.shortLabel !== "BANK" &&
    brand.shortLabel !== "CARD" &&
    brand.shortLabel !== "VÍ";

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size * 0.26,
          backgroundColor: brand.primaryColor,
        },
      ]}
    >
      {isBankOrWallet ? (
        <Text
          style={[
            styles.label,
            {
              fontSize: size * 0.32,
              color: brand.textColor,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {brand.shortLabel}
        </Text>
      ) : (
        <Ionicons
          name={getFallbackIcon()}
          size={size * 0.52}
          color={brand.textColor}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  imageContainer: {
    backgroundColor: "#ffffff",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  container: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 3,
  },
  label: {
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
  },
});
