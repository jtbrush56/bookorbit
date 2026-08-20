require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'BookorbitBackgroundAudio'
  s.version = package['version']
  s.summary = package['description']
  s.license = 'AGPL-3.0'
  s.homepage = 'https://bookorbit.app'
  s.author = 'BookOrbit'
  s.source = { :git => 'https://github.com/jtbrush56/bookorbit.git' }
  s.source_files = 'ios/Sources/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target = '14.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
