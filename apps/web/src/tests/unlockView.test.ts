import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { authMode } from "../config.js";
import { useSessionStore } from "../stores/session.js";
import UnlockView from "../views/UnlockView.vue";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push })
}));

function mountUnlockView() {
  return mount(UnlockView, {
    global: {
      stubs: {
        Button: { props: ["label", "disabled"], template: "<button type='submit' :disabled='disabled'>{{ label }}</button>" },
        InputOtp: defineComponent({
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template: "<input aria-label='PIN' :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />"
        }),
        Message: { template: "<p><slot /></p>" },
        Password: {
          props: ["modelValue"],
          emits: ["update:modelValue"],
          template: "<input placeholder='Password' :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />"
        }
      }
    }
  });
}

describe("UnlockView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    authMode.value = "password";
    push.mockClear();
  });

  it("keeps the password input when password auth is configured", () => {
    const wrapper = mountUnlockView();

    expect(wrapper.find("input[placeholder='Password']").exists()).toBe(true);
    expect(wrapper.find("input[aria-label='PIN']").exists()).toBe(false);
  });

  it("uses a masked 4-digit PIN input and submits when the PIN is complete", async () => {
    authMode.value = "pin";
    const session = useSessionStore();
    session.unlock = vi.fn(async () => true);
    const wrapper = mountUnlockView();

    await wrapper.find("input[aria-label='PIN']").setValue("123");
    await flushPromises();

    expect(session.unlock).not.toHaveBeenCalled();

    await wrapper.find("input[aria-label='PIN']").setValue("1234");
    await flushPromises();

    expect(session.unlock).toHaveBeenCalledWith("1234");
    expect(push).toHaveBeenCalledWith("/notes");
  });
});
