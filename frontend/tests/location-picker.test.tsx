import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.fn();
vi.mock("@/lib/api", () => ({ api: (...a: unknown[]) => api(...a) }));

import { LocationPicker } from "@/features/location/location-picker";
import { LocationProvider } from "@/features/location/location-provider";

const setup = () => render(<LocationProvider><LocationPicker /></LocationProvider>);

beforeEach(() => {
  api.mockReset();
  window.localStorage.clear();
});

describe("LocationPicker", () => {
  it("rejects invalid pincodes without calling the API", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /select location/i }));
    await userEvent.type(screen.getByLabelText("Delivery pincode"), "123");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("Enter a valid 6-digit pincode")).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("accepts a serviceable pincode, shows delivery terms and remembers it", async () => {
    api.mockResolvedValue({ data: { pincode: "560001", serviceable: true, area_name: "MG Road", city: "Bengaluru", delivery_fee_paise: 2500, min_order_paise: 9900 } });
    setup();
    await userEvent.click(screen.getByRole("button", { name: /select location/i }));
    await userEvent.type(screen.getByLabelText("Delivery pincode"), "560001");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByRole("button", { name: /delivering to 560001/i })).toBeInTheDocument();
    expect(window.localStorage.getItem("swiftcart.pincode")).toBe("560001");
    expect(api).toHaveBeenCalledWith("/serviceability/560001");
  });

  it("says when an area is not serviceable", async () => {
    api.mockResolvedValue({ data: { pincode: "999999", serviceable: false } });
    setup();
    await userEvent.click(screen.getByRole("button", { name: /select location/i }));
    await userEvent.type(screen.getByLabelText("Delivery pincode"), "999999");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText(/do not deliver to 999999/i)).toBeInTheDocument();
  });

  it("shows a friendly error when the API is unreachable", async () => {
    api.mockRejectedValue(new Error("down"));
    setup();
    await userEvent.click(screen.getByRole("button", { name: /select location/i }));
    await userEvent.type(screen.getByLabelText("Delivery pincode"), "560001");
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText(/could not check this pincode/i)).toBeInTheDocument();
  });

  it("restores a remembered pincode on load", async () => {
    window.localStorage.setItem("swiftcart.pincode", "560001");
    api.mockResolvedValue({ data: { pincode: "560001", serviceable: true, area_name: "MG Road", city: "Bengaluru", delivery_fee_paise: 2500, min_order_paise: 9900 } });
    setup();
    expect(await screen.findByRole("button", { name: /delivering to 560001/i })).toBeInTheDocument();
  });
});
