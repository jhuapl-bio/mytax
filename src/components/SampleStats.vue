<template>
  <v-container>
    <v-row class="text-center">
        <v-toolbar-title>
            Sample Stats Playback
        </v-toolbar-title>
    </v-row>
  </v-container>
</template>

<script>
  export default {
    name: 'SampleStats',
    props: ['playbackdata'],
    data: () => ({
    }),
    watch: {
      playbackdata(){
        console.log("new playback data")
      }
    },
    mounted(){
      
    },
    methods: {
        
    }
  }
</script>
