<script setup lang="ts">
import Button from "primevue/button";
import InputOtp from "primevue/inputotp";
import Message from "primevue/message";
import Password from "primevue/password";
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { appTitle, authMode } from "../config.js";
import { useSessionStore } from "../stores/session.js";

const credential = ref("");
const unlocking = ref(false);
const session = useSessionStore();
const router = useRouter();
const isPinMode = computed(() => authMode.value === "pin");
const canSubmit = computed(() => !isPinMode.value || /^\d{4}$/.test(credential.value));
const unlockError = computed(() => session.error === "Invalid password" && isPinMode.value ? "Invalid PIN" : session.error);

async function submit() {
  if (!canSubmit.value || unlocking.value) return;
  unlocking.value = true;
  try {
    if (await session.unlock(credential.value)) await router.push("/notes");
  } finally {
    unlocking.value = false;
  }
}

watch(credential, (value) => {
  if (isPinMode.value && /^\d{4}$/.test(value)) void submit();
});
</script>

<template>
  <div class="unlock">
    <form @submit.prevent="submit">
      <h1>{{ appTitle }}</h1>
      <InputOtp v-if="isPinMode" v-model="credential" class="unlock-pin" aria-label="PIN" autocomplete="one-time-code" :length="4" integer-only mask />
      <Password v-else v-model="credential" autocomplete="current-password" placeholder="Password" :feedback="false" toggle-mask />
      <Button label="Unlock" type="submit" :disabled="!canSubmit || unlocking" />
      <Message v-if="unlockError" severity="error" size="small">{{ unlockError }}</Message>
    </form>
  </div>
</template>
