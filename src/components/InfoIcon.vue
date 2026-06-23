<template>
  <v-tooltip top max-width="280" :open-delay="100">
    <template v-slot:activator="{ on, attrs }">
      <span class="mtx-info-icon" v-bind="attrs" v-on="on">ℹ</span>
    </template>
    <span class="mtx-info-tip-text">{{ text }}</span>
  </v-tooltip>
</template>

<script>
export default {
  name: 'InfoIcon',
  props: {
    text: { type: String, required: true }
  }
}
</script>

<style scoped>
.mtx-info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #cdd8e4;
  color: #3b5673;
  font-size: 9px;
  font-weight: 800;
  cursor: help;
  margin-left: 4px;
  vertical-align: middle;
  text-transform: none;
  letter-spacing: 0;
  font-style: normal;
  line-height: 1;
  transition: background .12s, color .12s;
  flex-shrink: 0;
}
.mtx-info-icon:hover {
  background: #274766;
  color: #fff;
}
</style>

<style>
/* Unscoped so Vuetify's tooltip content is styled */
.mtx-info-tip-text {
  font-size: 12px;
  line-height: 1.5;
  white-space: normal;
  display: block;
}
</style>
