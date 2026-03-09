import { LoginErrorType, type LoginError } from "@shopify/shopify-app-remix/server";

export function loginErrorMessage(loginErrors: LoginError[]) {
  if (loginErrors?.length === 0) return {};

  const errorMessage = loginErrors.map((error) => {
    switch (error.type) {
      case LoginErrorType.MissingShop:
        return { shop: "Please enter your shop domain to log in" };
      case LoginErrorType.InvalidShop:
        return { shop: "Please enter a valid shop domain to log in" };
      default:
        return {};
    }
  });

  return errorMessage[0] || {};
}
