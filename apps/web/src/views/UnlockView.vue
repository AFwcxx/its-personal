<script setup lang="ts">
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
      <input v-model="password" type="password" autocomplete="current-password" placeholder="Password" />
      <button>Unlock</button>
      <p v-if="session.error" class="danger">{{ session.error }}</p>
    </form>
  </div>
</template>
