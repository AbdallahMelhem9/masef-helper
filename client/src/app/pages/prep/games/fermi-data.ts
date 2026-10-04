// Fermi questions with reference values. The scoring is on a log scale, so a
// value off by a few percent changes nothing; quantities that move (traffic,
// company sizes) are given with their year.
// tier 1 = everyday, 2 = needs a decomposition, 3 = obscure or huge.

export interface FermiQ {
  q: string;
  value: number;
  unit: string;
  tier: 1 | 2 | 3;
  note?: string;
}

export const FERMI: FermiQ[] = [
  // tier 1
  { q: 'Height of the Eiffel Tower, antennas included', value: 330, unit: 'm', tier: 1 },
  { q: 'Countries in Africa (UN members)', value: 54, unit: 'countries', tier: 1 },
  { q: 'Bones in the adult human body', value: 206, unit: 'bones', tier: 1 },
  { q: 'Keys on a standard piano', value: 88, unit: 'keys', tier: 1 },
  { q: 'Height of Mount Everest', value: 8849, unit: 'm', tier: 1 },
  { q: 'Seconds in a day', value: 86400, unit: 's', tier: 1 },
  { q: 'Length of a marathon', value: 42195, unit: 'm', tier: 1 },
  { q: 'Speed of sound in air at 20 °C', value: 343, unit: 'm/s', tier: 1 },
  { q: 'Hours in a (non-leap) year', value: 8760, unit: 'h', tier: 1 },
  { q: 'Member states of the United Nations', value: 193, unit: 'states', tier: 1 },
  { q: 'Seats in the French Assemblée nationale', value: 577, unit: 'seats', tier: 1 },
  { q: 'Height of the Burj Khalifa', value: 828, unit: 'm', tier: 1 },
  { q: 'Length of the Paris périphérique ring road', value: 35, unit: 'km', tier: 1 },
  { q: 'Height of the Tour Montparnasse', value: 210, unit: 'm', tier: 1 },
  { q: 'Length of the Channel Tunnel', value: 50, unit: 'km', tier: 1 },
  { q: 'Trading days in a year on the NYSE', value: 252, unit: 'days', tier: 1 },
  { q: 'Squares of all sizes on a chessboard', value: 204, unit: 'squares', tier: 1 },
  { q: 'Population of France (2024)', value: 68.4e6, unit: 'people', tier: 1 },
  { q: 'World population (2024)', value: 8.1e9, unit: 'people', tier: 1 },
  { q: 'Distance from the Earth to the Moon', value: 384400, unit: 'km', tier: 1 },
  { q: 'Maximum number of bitcoins that will ever exist', value: 21e6, unit: 'BTC', tier: 1 },
  { q: 'Population of the city of Paris (intra-muros)', value: 2.1e6, unit: 'people', tier: 1 },

  // tier 2
  { q: 'Road distance from Paris to Marseille', value: 775, unit: 'km', tier: 2 },
  { q: 'Length of the Seine', value: 777, unit: 'km', tier: 2 },
  { q: 'Area of metropolitan France', value: 552000, unit: 'km²', tier: 2 },
  { q: 'Great-circle distance Paris – New York', value: 5840, unit: 'km', tier: 2 },
  { q: 'Diameter of the Earth', value: 12742, unit: 'km', tier: 2 },
  { q: 'Diameter of the Moon', value: 3474, unit: 'km', tier: 2 },
  { q: 'Distance from the Earth to the Sun', value: 149.6e6, unit: 'km', tier: 2 },
  { q: 'Speed of light', value: 299792, unit: 'km/s', tier: 2 },
  { q: 'Seconds in a year', value: 31.536e6, unit: 's', tier: 2 },
  { q: 'Volume of an Olympic swimming pool (50 × 25 × 2 m)', value: 2.5e6, unit: 'litres', tier: 2 },
  { q: 'Births in France in 2023', value: 678000, unit: 'births', tier: 2 },
  { q: 'Passengers through Paris-CDG airport in 2023', value: 67.4e6, unit: 'passengers', tier: 2 },
  { q: 'Visitors to the Louvre in 2023', value: 8.9e6, unit: 'visitors', tier: 2 },
  { q: 'Starbucks stores worldwide (2024)', value: 40000, unit: 'stores', tier: 2 },
  { q: "McDonald's restaurants worldwide (2023)", value: 41800, unit: 'restaurants', tier: 2 },
  { q: 'Hairs on a human head', value: 100000, unit: 'hairs', tier: 2 },
  { q: 'Floors in the Burj Khalifa', value: 163, unit: 'floors', tier: 2 },
  { q: 'Population of China (2023)', value: 1.41e9, unit: 'people', tier: 2 },
  { q: 'US GDP in 2023', value: 27.4e12, unit: 'USD', tier: 2 },
  { q: 'French GDP in 2023', value: 2.8e12, unit: 'EUR', tier: 2 },
  { q: 'Commercial flights worldwide on a typical day', value: 100000, unit: 'flights', tier: 2 },
  { q: '2 to the power 30', value: 1073741824, unit: '', tier: 2 },
  { q: 'e to the power 10', value: 22026, unit: '', tier: 2 },
  { q: 'Prime numbers below 1000', value: 168, unit: 'primes', tier: 2 },
  { q: 'Rooms in the Palace of Versailles', value: 2300, unit: 'rooms', tier: 2 },
  { q: 'Companies in the S&P 500', value: 500, unit: 'companies', tier: 2 },

  // tier 3
  { q: 'Distinct 5-card poker hands from a 52-card deck', value: 2598960, unit: 'hands', tier: 3 },
  { q: 'Orderings of a 52-card deck', value: 8.07e67, unit: 'orderings', tier: 3, note: '52! — type it as 8e67 if you like' },
  { q: 'Average daily turnover of the global FX market (BIS survey, 2022)', value: 7.5e12, unit: 'USD per day', tier: 3 },
  { q: 'Neurons in the human brain', value: 86e9, unit: 'neurons', tier: 3 },
  { q: 'Cells in the human body', value: 3.7e13, unit: 'cells', tier: 3 },
  { q: 'Age of the universe', value: 13.8e9, unit: 'years', tier: 3 },
  { q: 'iPhones sold worldwide in 2023', value: 235e6, unit: 'phones', tier: 3 },
  { q: 'Employees of LVMH (2023)', value: 213000, unit: 'employees', tier: 3 },
  { q: 'Maximum take-off weight of a Boeing 747-400', value: 397, unit: 'tonnes', tier: 3 },
  { q: 'Articles on the English Wikipedia (2025)', value: 6.9e6, unit: 'articles', tier: 3 },
  { q: '17 factorial', value: 355687428096000, unit: '', tier: 3 },
  { q: 'Sum of the integers from 1 to 10 000', value: 50005000, unit: '', tier: 3 },
  { q: 'Grains of rice in a 1 kg bag', value: 50000, unit: 'grains', tier: 3, note: 'long-grain rice, about 20 mg a grain' },
  { q: 'Heartbeats in an 80-year human life', value: 3e9, unit: 'beats', tier: 3 },
  { q: 'Litres of water in Lake Geneva', value: 8.9e13, unit: 'litres', tier: 3, note: '89 km³' },
];
