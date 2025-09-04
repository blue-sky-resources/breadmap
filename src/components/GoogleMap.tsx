import { useEffect, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";

interface PrecinctData {
  geoid: string;
  state: string;
  county: string;
  votesDem: number;
  votesRep: number;
  votesTotal: number;
  pctDemLead: number;
}

interface GoogleMapProps {
  apiKey: string;
  center?: { lat: number; lng: number };
  zoom?: number;
}

// US state FIPS codes to names mapping
const US_STATES: Record<string, string> = {
  "01": "Alabama",
  "02": "Alaska",
  "04": "Arizona",
  "05": "Arkansas",
  "06": "California",
  "08": "Colorado",
  "09": "Connecticut",
  "10": "Delaware",
  "11": "District of Columbia",
  "12": "Florida",
  "13": "Georgia",
  "15": "Hawaii",
  "16": "Idaho",
  "17": "Illinois",
  "18": "Indiana",
  "19": "Iowa",
  "20": "Kansas",
  "21": "Kentucky",
  "22": "Louisiana",
  "23": "Maine",
  "24": "Maryland",
  "25": "Massachusetts",
  "26": "Michigan",
  "27": "Minnesota",
  "28": "Mississippi",
  "29": "Missouri",
  "30": "Montana",
  "31": "Nebraska",
  "32": "Nevada",
  "33": "New Hampshire",
  "34": "New Jersey",
  "35": "New Mexico",
  "36": "New York",
  "37": "North Carolina",
  "38": "North Dakota",
  "39": "Ohio",
  "40": "Oklahoma",
  "41": "Oregon",
  "42": "Pennsylvania",
  "44": "Rhode Island",
  "45": "South Carolina",
  "46": "South Dakota",
  "47": "Tennessee",
  "48": "Texas",
  "49": "Utah",
  "50": "Vermont",
  "51": "Virginia",
  "53": "Washington",
  "54": "West Virginia",
  "55": "Wisconsin",
  "56": "Wyoming",
  "60": "American Samoa",
  "66": "Guam",
  "69": "Northern Mariana Islands",
  "72": "Puerto Rico",
  "78": "Virgin Islands",
};

// Colorado county FIPS codes to names mapping
const COLORADO_COUNTIES: Record<string, string> = {
  "001": "Adams",
  "003": "Alamosa",
  "005": "Arapahoe",
  "007": "Archuleta",
  "009": "Baca",
  "011": "Bent",
  "013": "Boulder",
  "014": "Broomfield",
  "015": "Chaffee",
  "017": "Cheyenne",
  "019": "Clear Creek",
  "021": "Conejos",
  "023": "Costilla",
  "025": "Crowley",
  "027": "Custer",
  "029": "Delta",
  "031": "Denver",
  "033": "Dolores",
  "035": "Douglas",
  "037": "Eagle",
  "039": "Elbert",
  "041": "El Paso",
  "043": "Fremont",
  "045": "Garfield",
  "047": "Gilpin",
  "049": "Grand",
  "051": "Gunnison",
  "053": "Hinsdale",
  "055": "Huerfano",
  "057": "Jackson",
  "059": "Jefferson",
  "061": "Kiowa",
  "063": "Kit Carson",
  "065": "Lake",
  "067": "La Plata",
  "069": "Larimer",
  "071": "Las Animas",
  "073": "Lincoln",
  "075": "Logan",
  "077": "Mesa",
  "079": "Mineral",
  "081": "Moffat",
  "083": "Montezuma",
  "085": "Montrose",
  "087": "Morgan",
  "089": "Otero",
  "091": "Ouray",
  "093": "Park",
  "095": "Phillips",
  "097": "Pitkin",
  "099": "Prowers",
  "101": "Pueblo",
  "103": "Rio Blanco",
  "105": "Rio Grande",
  "107": "Routt",
  "109": "Saguache",
  "111": "San Juan",
  "113": "San Miguel",
  "115": "Sedgwick",
  "117": "Summit",
  "119": "Teller",
  "121": "Washington",
  "123": "Weld",
  "125": "Yuma",
};

export function GoogleMap({
  apiKey,
  center = { lat: 39.7392, lng: -104.9903 },
  zoom = 8,
}: GoogleMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPrecinct, setSelectedPrecinct] = useState<PrecinctData | null>(
    null
  );
  const [rawElectionData, setRawElectionData] = useState<any>(null);

  const getColorForMargin = (pctDemLead: number): string => {
    // NYTimes-style color scheme
    const absMargin = Math.abs(pctDemLead);

    if (pctDemLead > 0) {
      // Democratic lean
      if (absMargin >= 0.5) return "#1f77b4"; // Strong blue
      if (absMargin >= 0.3) return "#5ba3d4"; // Medium blue
      if (absMargin >= 0.15) return "#9ac9e3"; // Light blue
      return "#c6dbef"; // Very light blue
    } else {
      // Republican lean
      if (absMargin >= 0.5) return "#d62728"; // Strong red
      if (absMargin >= 0.3) return "#e55a5a"; // Medium red
      if (absMargin >= 0.15) return "#f28e8e"; // Light red
      return "#f9c2c2"; // Very light red
    }
  };

  const parseGeoId = (
    geoid: string
  ): { state: string; county: string; precinct: string } => {
    // GEOID format: {state_code}{county_code}-{precinct_id}
    // Example: "08001-8134801173"

    /**
     * Regex breakdown: /^(\d{2})(\d{3})-(.+)$/
     *
     * ^            - Start of string anchor (ensures we match from beginning)
     * (\d{2})      - Capture group 1: Exactly 2 digits (state FIPS code)
     *                \d = digit (0-9), {2} = exactly 2 times
     * (\d{3})      - Capture group 2: Exactly 3 digits (county FIPS code)
     *                \d = digit (0-9), {3} = exactly 3 times
     * -            - Literal dash character (separator)
     * (.+)         - Capture group 3: One or more of any character (precinct ID)
     *                . = any character, + = one or more times
     * $            - End of string anchor (ensures we match to end)
     *
     * Result: match[1] = state code, match[2] = county code, match[3] = precinct ID
     */
    const match = geoid.match(/^(\d{2})(\d{3})-(.+)$/);
    if (!match) return { state: "Unknown", county: "Unknown", precinct: geoid };

    const stateCode = match[1]; // "08" from "08001-8134801173"
    const countyCode = match[2]; // "001" from "08001-8134801173"
    const precinctId = match[3]; // "8134801173" from "08001-8134801173"

    const stateName = US_STATES[stateCode] || `State ${stateCode}`;
    const countyName = COLORADO_COUNTIES[countyCode] || `County ${countyCode}`;

    return { state: stateName, county: countyName, precinct: precinctId };
  };

  const loadElectionData = async (map: google.maps.Map) => {
    try {
      const response = await fetch("/CO-precincts-with-results.geojson");
      if (!response.ok) {
        throw new Error(`Failed to load data: ${response.statusText}`);
      }
      const geojsonData = await response.json();

      // Store raw data for rollup calculations
      setRawElectionData(geojsonData);
      console.log("Raw election data loaded:", geojsonData);

      // Add GeoJSON layer
      map.data.addGeoJson(geojsonData);

      // Style the features
      map.data.setStyle((feature) => {
        const votesDem = (feature.getProperty("votes_dem") as number) || 0;
        const votesRep = (feature.getProperty("votes_rep") as number) || 0;
        const votesTotal = (feature.getProperty("votes_total") as number) || 0;
        const pctDemLead = (feature.getProperty("pct_dem_lead") as number) || 0;

        if (votesTotal === 0)
          return {
            fillColor: "#cccccc",
            fillOpacity: 0.7,
            strokeWeight: 0.5,
            strokeColor: "#ffffff",
          };

        const fillColor = getColorForMargin(pctDemLead);

        return {
          fillColor,
          fillOpacity: 0.8,
          strokeWeight: 0.5,
          strokeColor: "#ffffff",
          strokeOpacity: 1,
        };
      });

      // Add click handler for sidebar
      map.data.addListener("click", (event: google.maps.Data.MouseEvent) => {
        const feature = event.feature;
        if (!feature) return;

        const geoid = (feature.getProperty("GEOID") as string) || "Unknown";
        const votesDem = (feature.getProperty("votes_dem") as number) || 0;
        const votesRep = (feature.getProperty("votes_rep") as number) || 0;
        const votesTotal = (feature.getProperty("votes_total") as number) || 0;
        const pctDemLead = (feature.getProperty("pct_dem_lead") as number) || 0;

        const { state, county } = parseGeoId(geoid);
        
        setSelectedPrecinct({
          geoid,
          state,
          county,
          votesDem,
          votesRep,
          votesTotal,
          pctDemLead,
        });
      });

      // Add hover effect for visual feedback
      map.data.addListener(
        "mouseover",
        (event: google.maps.Data.MouseEvent) => {
          map.data.overrideStyle(event.feature, {
            strokeWeight: 2,
            strokeColor: "#333333",
            fillOpacity: 0.9,
          });
        }
      );

      map.data.addListener("mouseout", (event: google.maps.Data.MouseEvent) => {
        map.data.revertStyle(event.feature);
      });

      setIsLoading(false);
    } catch (err) {
      console.error("Error loading election data:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load election data"
      );
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initMap = async () => {
      if (!mapRef.current || mapInstanceRef.current) return;

      const loader = new Loader({
        apiKey,
        version: "weekly",
        libraries: ["maps"],
      });

      try {
        await loader.load();

        // NYTimes-inspired map styling
        const mapStyles = [
          {
            featureType: "all",
            elementType: "geometry.fill",
            stylers: [{ color: "#f5f5f5" }],
          },
          {
            featureType: "administrative",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
          {
            featureType: "administrative.country",
            elementType: "geometry.stroke",
            stylers: [{ color: "#c0c0c0" }, { weight: 0.5 }],
          },
          {
            featureType: "administrative.province",
            elementType: "geometry.stroke",
            stylers: [{ color: "#a0a0a0" }, { weight: 1 }],
          },
          {
            featureType: "landscape",
            elementType: "geometry",
            stylers: [{ color: "#f9f9f9" }],
          },
          {
            featureType: "poi",
            stylers: [{ visibility: "off" }],
          },
          {
            featureType: "road",
            elementType: "geometry",
            stylers: [{ color: "#ffffff" }, { weight: 0.5 }],
          },
          {
            featureType: "road",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
          {
            featureType: "transit",
            stylers: [{ visibility: "off" }],
          },
          {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#e8e8e8" }],
          },
        ];

        mapInstanceRef.current = new google.maps.Map(mapRef.current, {
          center,
          zoom,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: mapStyles,
          backgroundColor: "#f5f5f5",
        });

        // Load election data
        await loadElectionData(mapInstanceRef.current);
      } catch (error) {
        console.error("Error loading Google Maps:", error);
        setError(
          error instanceof Error ? error.message : "Failed to load Google Maps"
        );
        setIsLoading(false);
      }
    };

    initMap();

    return () => {
      mapInstanceRef.current = null;
    };
  }, [apiKey, center, zoom]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
      }}
    >
      <div
        ref={mapRef}
        style={{
          flex: 1,
          height: "100%",
        }}
      />
      <div
        style={{
          width: "400px",
          height: "100%",
          backgroundColor: "#ffffff",
          borderLeft: "1px solid #e0e0e0",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          overflow: "auto",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "24px" }}>
          {selectedPrecinct ? (
            <div>
              {/* Header */}
              <div style={{ marginBottom: "24px" }}>
                <h2
                  style={{
                    margin: "0 0 8px 0",
                    fontSize: "20px",
                    fontWeight: "600",
                    color: "#333",
                  }}
                >
                  Precinct Details
                </h2>
              </div>

              {/* Geographic Hierarchy */}
              <div style={{ marginBottom: "32px" }}>
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    marginBottom: "12px",
                    color: "#333",
                  }}
                >
                  Location
                </h3>
                <div style={{ marginBottom: "8px" }}>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "#666",
                    }}
                  >
                    State:{" "}
                  </span>
                  <span style={{ fontSize: "14px", color: "#333" }}>
                    {selectedPrecinct.state}
                  </span>
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "#666",
                    }}
                  >
                    County:{" "}
                  </span>
                  <span style={{ fontSize: "14px", color: "#333" }}>
                    {selectedPrecinct.county} County
                  </span>
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "#666",
                    }}
                  >
                    Precinct:{" "}
                  </span>
                  <span style={{ fontSize: "14px", color: "#333" }}>
                    {selectedPrecinct.geoid}
                  </span>
                </div>
              </div>

              {/* Results */}
              <div style={{ marginBottom: "32px" }}>
                <h3
                  style={{
                    fontSize: "18px",
                    fontWeight: "600",
                    marginBottom: "16px",
                    color: "#333",
                  }}
                >
                  Election Results
                </h3>

                {(() => {
                  const margin = Math.abs(selectedPrecinct.pctDemLead);
                  const winner =
                    selectedPrecinct.pctDemLead > 0
                      ? "Democratic"
                      : "Republican";
                  const winnerColor =
                    selectedPrecinct.pctDemLead > 0 ? "#1f77b4" : "#d62728";
                  const marginPercent = (margin * 100).toFixed(1);

                  return (
                    <div>
                      <div
                        style={{
                          backgroundColor: winnerColor,
                          color: "white",
                          padding: "12px 16px",
                          borderRadius: "6px",
                          marginBottom: "16px",
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: "16px", fontWeight: "600" }}>
                          {winner} +{marginPercent}%
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Vote Breakdown */}
                <div style={{ marginBottom: "16px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 0",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <div
                        style={{
                          width: "12px",
                          height: "12px",
                          backgroundColor: "#1f77b4",
                          borderRadius: "50%",
                          marginRight: "8px",
                        }}
                      ></div>
                      <span style={{ fontSize: "14px" }}>Democratic</span>
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: "600" }}>
                      {selectedPrecinct.votesDem.toLocaleString()}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 0",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <div
                        style={{
                          width: "12px",
                          height: "12px",
                          backgroundColor: "#d62728",
                          borderRadius: "50%",
                          marginRight: "8px",
                        }}
                      ></div>
                      <span style={{ fontSize: "14px" }}>Republican</span>
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: "600" }}>
                      {selectedPrecinct.votesRep.toLocaleString()}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 0 0 0",
                    }}
                  >
                    <span style={{ fontSize: "14px", fontWeight: "600" }}>
                      Total Votes
                    </span>
                    <div style={{ fontSize: "16px", fontWeight: "600" }}>
                      {selectedPrecinct.votesTotal.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Percentages */}
                <div style={{ marginTop: "24px" }}>
                  <h4
                    style={{
                      fontSize: "16px",
                      fontWeight: "600",
                      marginBottom: "12px",
                      color: "#333",
                    }}
                  >
                    Vote Share
                  </h4>

                  {(() => {
                    const demPercent =
                      selectedPrecinct.votesTotal > 0
                        ? (
                            (selectedPrecinct.votesDem /
                              selectedPrecinct.votesTotal) *
                            100
                          ).toFixed(1)
                        : "0.0";
                    const repPercent =
                      selectedPrecinct.votesTotal > 0
                        ? (
                            (selectedPrecinct.votesRep /
                              selectedPrecinct.votesTotal) *
                            100
                          ).toFixed(1)
                        : "0.0";

                    return (
                      <div>
                        <div style={{ marginBottom: "8px" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "14px",
                            }}
                          >
                            <span>Democratic</span>
                            <span>{demPercent}%</span>
                          </div>
                          <div
                            style={{
                              width: "100%",
                              height: "6px",
                              backgroundColor: "#eee",
                              borderRadius: "3px",
                              marginTop: "4px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${demPercent}%`,
                                height: "100%",
                                backgroundColor: "#1f77b4",
                              }}
                            ></div>
                          </div>
                        </div>

                        <div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "14px",
                            }}
                          >
                            <span>Republican</span>
                            <span>{repPercent}%</span>
                          </div>
                          <div
                            style={{
                              width: "100%",
                              height: "6px",
                              backgroundColor: "#eee",
                              borderRadius: "3px",
                              marginTop: "4px",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${repPercent}%`,
                                height: "100%",
                                backgroundColor: "#d62728",
                              }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Placeholder content */}
              <div style={{ marginBottom: "24px" }}>
                <h2
                  style={{
                    margin: "0 0 8px 0",
                    fontSize: "20px",
                    fontWeight: "600",
                    color: "#333",
                  }}
                >
                  Colorado Election Results
                </h2>
                <p
                  style={{
                    margin: "0",
                    fontSize: "14px",
                    color: "#666",
                  }}
                >
                  Click on any precinct to see detailed results
                </p>
              </div>

              {/* Legend */}
              <div style={{ marginBottom: "24px" }}>
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    marginBottom: "12px",
                    color: "#333",
                  }}
                >
                  Color Legend
                </h3>

                <div style={{ marginBottom: "8px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        backgroundColor: "#1f77b4",
                        marginRight: "8px",
                        borderRadius: "2px",
                      }}
                    ></div>
                    <span style={{ fontSize: "12px" }}>
                      Strong Democratic (+50%)
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        backgroundColor: "#5ba3d4",
                        marginRight: "8px",
                        borderRadius: "2px",
                      }}
                    ></div>
                    <span style={{ fontSize: "12px" }}>Democratic (+30%)</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        backgroundColor: "#9ac9e3",
                        marginRight: "8px",
                        borderRadius: "2px",
                      }}
                    ></div>
                    <span style={{ fontSize: "12px" }}>
                      Lean Democratic (+15%)
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        backgroundColor: "#c6dbef",
                        marginRight: "8px",
                        borderRadius: "2px",
                      }}
                    ></div>
                    <span style={{ fontSize: "12px" }}>Slight Democratic</span>
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        backgroundColor: "#f9c2c2",
                        marginRight: "8px",
                        borderRadius: "2px",
                      }}
                    ></div>
                    <span style={{ fontSize: "12px" }}>Slight Republican</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        backgroundColor: "#f28e8e",
                        marginRight: "8px",
                        borderRadius: "2px",
                      }}
                    ></div>
                    <span style={{ fontSize: "12px" }}>
                      Lean Republican (+15%)
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        backgroundColor: "#e55a5a",
                        marginRight: "8px",
                        borderRadius: "2px",
                      }}
                    ></div>
                    <span style={{ fontSize: "12px" }}>Republican (+30%)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        backgroundColor: "#d62728",
                        marginRight: "8px",
                        borderRadius: "2px",
                      }}
                    ></div>
                    <span style={{ fontSize: "12px" }}>
                      Strong Republican (+50%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#f8f9fa",
                  borderRadius: "6px",
                  border: "1px solid #e9ecef",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    color: "#495057",
                    lineHeight: "1.4",
                  }}
                >
                  <strong>How to use:</strong>
                  <br />
                  • Click any colored precinct on the map
                  <br />
                  • View detailed vote counts and percentages
                  <br />• See which county the precinct belongs to
                </div>
              </div>

              {/* Debug Section */}
              <div>
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: "600",
                    marginBottom: "12px",
                    color: "#333",
                  }}
                >
                  Data Access
                </h3>
                <button
                  onClick={() => {
                    console.log("Raw Election Data:", rawElectionData);
                    console.log("Total features:", rawElectionData?.features?.length || 0);
                  }}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: "#007bff",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Log Raw Election Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            padding: "20px",
            borderRadius: "8px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: "16px",
            color: "#333",
            zIndex: 1000,
          }}
        >
          Loading Colorado Election Results...
        </div>
      )}

      {/* Error indicator */}
      {error && (
        <div
          style={{
            position: "absolute",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#ffebee",
            color: "#c62828",
            padding: "12px 20px",
            borderRadius: "6px",
            border: "1px solid #e57373",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: "14px",
            zIndex: 1000,
          }}
        >
          Error: {error}
        </div>
      )}
    </div>
  );
}
