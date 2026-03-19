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

      interface RoadAddress {
        address_name: string;
        building_name: string;
        region_1depth_name: string;
        region_2depth_name: string;
        region_3depth_name: string;
        road_name: string;
        main_building_no: string;
        sub_building_no: string;
      }

      interface JibunAddress {
        address_name: string;
        region_1depth_name: string;
        region_2depth_name: string;
        region_3depth_name: string;
        main_address_no: string;
        sub_address_no: string;
      }

      interface Coord2AddressResult {
        road_address: RoadAddress | null;
        address: JibunAddress;
      }

      type Coord2AddressCallback = (result: Coord2AddressResult[], status: Status) => void;

      class Geocoder {
        addressSearch(address: string, callback: AddressCallback): void;
        coord2Address(lng: number, lat: number, callback: Coord2AddressCallback): void;
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
