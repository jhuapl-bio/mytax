<template>
    
</template>

<script>
  import Plates from "@/components/Plates"
  import RunStats from "@/components/RunStats"
  import SampleStats from "@/components/SampleStats"
  import Data from "@/components/Data"
  import Map from "@/components/Map"
  export default {
    name: 'Main',
    props: ['inputdata', 'tab', 'tabs'],
    watch : {
    },
    components: {
      Plates,
      RunStats,
      SampleStats,
      Data,
      Map
    },

    data: () => ({
      
    }),
  }
</script>
