<template>
    <div class="mr-4">
      <h3>Tools/Software</h3>
        <v-data-table
            :items="commandOptions"
            :headers="headers"
            v-model="selected"
        >
            <template v-slot:item.status="{ item }">
                {{ item.status }}
                <v-icon  color="success" v-if="item.status == 'exists'">
                    mdi-check-circle
                </v-icon>
                <v-icon  color="error" v-else>
                    mdi-alert-circle
                </v-icon>
            </template>
    
        </v-data-table>
    </div>
    
  </template>
  
  <script>
  
  export default {
    name: 'Analysis',
    data() {
      return {
        selected: null, 
        headers: [
            {
                text: "Command",
                align: "start",
                sortable: false,
                value: "command"
            },
            { text: "Status", value: "status" },
            // { text: "Actions", value: "action", sortable: false }
        ]
      };
    },
    props: ["commandOptions"],
    watch: {
      
    },
    computed: {
     
    },
    mounted() {
      
    },
    methods: {
      
    }
  };
  </script>
  <style scoped>

  </style>