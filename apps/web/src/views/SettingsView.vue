<script setup lang="ts">
import Button from "primevue/button";
import AppShell from "../components/AppShell.vue";
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <AppShell>
    <h2>Settings</h2>
    <nav class="tabs settings-tabs" aria-label="Settings">
      <RouterLink v-slot="{ navigate, isActive }" to="/settings/tags" custom>
        <Button :class="{ active: isActive }" label="Tags" text @click="navigate" />
      </RouterLink>
      <RouterLink v-slot="{ navigate, isActive }" to="/settings/main-navi" custom>
        <Button :class="{ active: isActive }" label="Main Navi" text @click="navigate" />
      </RouterLink>
    </nav>
    <RouterView />
  </AppShell>
</template>
