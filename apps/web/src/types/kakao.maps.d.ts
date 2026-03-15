/* eslint-disable @typescript-eslint/no-explicit-any */
declare namespace kakao {
  namespace maps {
    function load(callback: () => void): void;

    class Map {
      constructor(container: HTMLElement, options: MapOptions);
      setCenter(latlng: LatLng): void;
      getCenter(): LatLng;
      setLevel(level: number): void;
    }

    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    class Marker {
      constructor(options: MarkerOptions);
      setMap(map: Map | null): void;
      getPosition(): LatLng;
    }

    class InfoWindow {
      constructor(options: InfoWindowOptions);
      open(map: Map, marker: Marker): void;
      close(): void;
    }

    namespace event {
      function addListener(target: any, type: string, handler: () => void): void;
      function removeListener(target: any, type: string, handler: () => void): void;
    }

    namespace clusterer {
      class MarkerClusterer {
        constructor(options: ClustererOptions);
        addMarkers(markers: Marker[], redraw?: boolean): void;
        clear(): void;
      }
    }

    interface MapOptions {
      center: LatLng;
      level: number;
    }

    interface MarkerOptions {
      position: LatLng;
      map?: Map;
      title?: string;
    }

    interface InfoWindowOptions {
      content: string;
      removable?: boolean;
    }

    interface ClustererOptions {
      map: Map;
      averageCenter?: boolean;
      minLevel?: number;
      disableClickZoom?: boolean;
    }
  }
}

interface Window {
  kakao: typeof kakao;
}
