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
      setPosition(latlng: LatLng): void;
    }

    class InfoWindow {
      constructor(options: InfoWindowOptions);
      open(map: Map, marker: Marker): void;
      close(): void;
    }

    class MouseEvent {
      latLng: LatLng;
    }

    namespace event {
      function addListener(
        target: Map,
        type: 'click',
        handler: (mouseEvent: MouseEvent) => void,
      ): void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function addListener(target: any, type: string, handler: (mouseEvent?: MouseEvent) => void): void;
      function removeListener(
        target: Map,
        type: 'click',
        handler: (mouseEvent: MouseEvent) => void,
      ): void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function removeListener(target: any, type: string, handler: (mouseEvent?: MouseEvent) => void): void;
    }

     
    namespace clusterer {
      class MarkerClusterer {
        constructor(options: ClustererOptions);
        addMarkers(markers: Marker[], redraw?: boolean): void;
        clear(): void;
      }
    }

    namespace services {
      enum Status {
        OK = 'OK',
        ZERO_RESULTS = 'ZERO_RESULTS',
        ERROR = 'ERROR',
      }

      interface AddressResult {
        x: string;
        y: string;
        address_name: string;
      }

      type AddressCallback = (result: AddressResult[], status: Status) => void;

      class Geocoder {
        addressSearch(address: string, callback: AddressCallback): void;
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

interface DaumAddressData {
  roadAddress: string;
  jibunAddress: string;
  address: string;
}

interface Window {
  kakao: typeof kakao;
  daum?: {
    Postcode: new (options: { oncomplete: (data: DaumAddressData) => void }) => { open(): void };
  };
}
