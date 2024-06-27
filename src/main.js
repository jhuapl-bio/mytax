import Vue from 'vue'
import App from './App.vue'
import vuetify from './plugins/vuetify'
import VueSweetalert2 from 'vue-sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import 'material-design-icons-iconfont/dist/material-design-icons.css'

import JsonExcel from "vue-json-excel";
import VueJsonToCsv from 'vue-json-to-csv'


Vue.component("downloadExcel", JsonExcel);
Vue.config.productionTip = false
Vue.use(VueSweetalert2);
Vue.use(VueJsonToCsv);
new Vue({
  vuetify,
  render: h => h(App)
}).$mount('#app')
