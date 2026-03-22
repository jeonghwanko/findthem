require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name                = 'CapacitorIAP'
  s.version             = package['version']
  s.summary             = package['description']
  s.license             = { :type => 'MIT' }
  s.homepage            = 'https://github.com/jeonghwanko/findthem'
  s.author              = 'FindThem'
  s.source              = { :git => 'https://github.com/jeonghwanko/findthem.git', :tag => s.version.to_s }
  s.source_files        = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '16.0'
  s.swift_version       = '5.9'
  s.dependency          'Capacitor'
  s.frameworks          = 'StoreKit'
end
