<script setup lang="ts">
import Button from "primevue/button";
import Message from "primevue/message";
import Password from "primevue/password";
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "../stores/session.js";

const password = ref("");
const session = useSessionStore();
const router = useRouter();

async function submit() {
  if (await session.unlock(password.value)) await router.push("/planner");
}
</script>

<template>
  <div class="unlock">
    <form @submit.prevent="submit">
      <h1>Its Personal</h1>
      <Password v-model="password" autocomplete="current-password" placeholder="Password" :feedback="false" toggle-mask />
      <Button label="Unlock" type="submit" />
      <Message v-if="session.error" severity="error" size="small">{{ session.error }}</Message>
    </form>
  </div>
</template>
