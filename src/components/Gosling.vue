<template>
  <v-container>
    <v-toolbar-title>
        Gosling Plot(s)
    </v-toolbar-title>
  </v-container>
</template>

<script>
  // import { GoslingComponent } from "gosling.js";

  export default {
    name: 'Gosling', 
    components: [
      // GoslingComponent
    ],
    props: ["inputdata", "dimensions", "socket", 'samplenames', 'selectedTaxid', 'selectedAttribute',  'legendPlacement'],
    watch: {
    },
    data: () => ({
      width: 500,
      height: 500,
      top_n: 3,

    }),
    methods: {
       
    },
    mounted(){ 
      console.log(this)
    //   gosling.embed(
    //     document.getElementById('gosling-container'),
    //     {
    //       "tracks": [{
    //         "data": {
    //           "url": "https://server.gosling-lang.org/api/v1/tileset_info/?d=cistrome-multivec",
    //           "type": "multivec",
    //           "row": "sample",
    //           "column": "position",
    //           "value": "peak",
    //           "categories": ["sample 1"]
    //         },
    //         "mark": "rect",
    //         "x": { "field": "position", "type": "genomic" },
    //         "color": { "field": "peak", "type": "quantitative", "legend": true },
    //         "width": 600,
    //         "height": 130
    //       }]
    //     }
    //   );
    }
  }
</script>
